-- Item-level exclusions ("no bread for me") alongside category-level ones.
-- The split engine matches params.item as a substring of the purchase_item name.
alter table policies drop constraint if exists policies_type_check;
alter table policies add constraint policies_type_check
  check (type in ('exclude_category','exclude_item','approval_threshold','split_weight'));
