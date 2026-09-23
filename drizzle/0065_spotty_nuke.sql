ALTER TABLE `invoices` ADD `issued_snapshot` text;--> statement-breakpoint
-- Freeze already-issued invoices at the current issuer/customer data so later
-- edits no longer rewrite them. Drafts stay live until they are sent.
UPDATE `invoices` SET `issued_snapshot` = json_object(
	'issuer', json((SELECT json_object('companyName', `company_name`, 'address', `address`, 'uid', `uid`, 'iban', `iban`, 'bic', `bic`, 'kleinunternehmer', json(CASE WHEN `kleinunternehmer` THEN 'true' ELSE 'false' END)) FROM `app_settings` WHERE `id` = 'default')),
	'customer', json((SELECT json_object('name', `name`, 'address', `address`, 'uid', `uid`) FROM `customers` WHERE `customers`.`id` = `invoices`.`customer_id`))
) WHERE `status` != 'draft';
