-- Permite várias instâncias no mesmo pedido, mantendo cada instância vinculada a um único pedido.
ALTER TABLE `h2ads_order_links` DROP INDEX `h2ads_order_links_order_unique`;
