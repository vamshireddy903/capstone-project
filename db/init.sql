-- Database: ecommerce (created by MYSQL_DATABASE)

CREATE TABLE IF NOT EXISTS users (
  user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY ux_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  product_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price_cents INT NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id),
  UNIQUE KEY ux_products_sku (sku),
  KEY ix_products_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS carts (
  cart_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cart_id),
  UNIQUE KEY ux_carts_user (user_id),
  CONSTRAINT fk_carts_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cart_items (
  cart_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cart_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  qty INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cart_item_id),
  UNIQUE KEY ux_cart_items (cart_id, product_id),
  CONSTRAINT fk_cart_items_cart FOREIGN KEY (cart_id) REFERENCES carts(cart_id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_items_product FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  order_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL,
  total_cents INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (order_id),
  KEY ix_orders_user_created (user_id, created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  order_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  qty INT NOT NULL,
  price_cents INT NOT NULL,
  PRIMARY KEY (order_item_id),
  KEY ix_order_items_order (order_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  payment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  provider_ref VARCHAR(128),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id),
  UNIQUE KEY ux_payments_order (order_id),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS otps (
  otp_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  purpose VARCHAR(64) NOT NULL,
  otp_code VARCHAR(16) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (otp_id),
  KEY ix_otps_user_exp (user_id, expires_at),
  CONSTRAINT fk_otps_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Demonstrate trigger: validate qty
DELIMITER $$
CREATE TRIGGER trg_order_items_qty
BEFORE INSERT ON order_items
FOR EACH ROW
BEGIN
  IF NEW.qty <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'qty must be > 0';
  END IF;
END$$
DELIMITER ;

-- Demonstrate procedure: place order (simple JSON format)
-- items_json example: [{"product_id":1,"qty":2},{"product_id":3,"qty":1}]
DELIMITER $$
CREATE PROCEDURE sp_place_order(
  IN p_user_id BIGINT UNSIGNED,
  IN p_items_json JSON
)
BEGIN
  DECLARE v_order_id BIGINT UNSIGNED;
  DECLARE v_total INT DEFAULT 0;
  DECLARE i INT DEFAULT 0;
  DECLARE n INT DEFAULT JSON_LENGTH(p_items_json);

  START TRANSACTION;

  INSERT INTO orders(user_id, status, total_cents) VALUES (p_user_id, 'CREATED', 0);
  SET v_order_id = LAST_INSERT_ID();

  WHILE i < n DO
    SET @pid = JSON_EXTRACT(p_items_json, CONCAT('$[', i, '].product_id'));
    SET @qty = JSON_EXTRACT(p_items_json, CONCAT('$[', i, '].qty'));

    SET @p = (SELECT price_cents FROM products WHERE product_id = @pid FOR UPDATE);
    SET @s = (SELECT stock FROM products WHERE product_id = @pid FOR UPDATE);

    IF @s < @qty THEN
      ROLLBACK;
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'insufficient stock';
    END IF;

    UPDATE products SET stock = stock - @qty WHERE product_id = @pid;
    INSERT INTO order_items(order_id, product_id, qty, price_cents)
    VALUES (v_order_id, @pid, @qty, @p);

    SET v_total = v_total + (@p * @qty);
    SET i = i + 1;
  END WHILE;

  UPDATE orders SET total_cents = v_total WHERE order_id = v_order_id;
  COMMIT;

  SELECT v_order_id AS order_id, v_total AS total_cents;
END$$
DELIMITER ;

INSERT INTO products (sku, name, description, price_cents, stock) VALUES
('AMZ-BASICS-001', 'Capstone Basics USB-C Cable', 'Durable braided USB-C cable', 1299, 100),
('AMZ-ECHO-001', 'Capstone Smart Speaker', 'Voice assistant speaker', 4999, 50),
('AMZ-KB-001', 'Capstone Mechanical Keyboard', 'Tactile mechanical keyboard', 8999, 25)
ON DUPLICATE KEY UPDATE name=VALUES(name);

