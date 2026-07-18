-- Accept ANY household rule: rules that don't map to a structured type are stored
-- as free-text `custom` policies (recorded + shown; the split engine only enforces
-- the structured types). Widens the policies.type check to allow 'custom'.
alter table policies drop constraint if exists policies_type_check;
alter table policies add constraint policies_type_check
  check (type in ('exclude_category','exclude_item','approval_threshold','split_weight','custom'));
