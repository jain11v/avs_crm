-- Some commission arrangements pay an extra "reward" % on top of the
-- usual brokerage — optional, applies regardless of vertical (unlike
-- tp_brok_percent, which is Motor-only).
ALTER TABLE commission ADD COLUMN reward_percent NUMERIC;
