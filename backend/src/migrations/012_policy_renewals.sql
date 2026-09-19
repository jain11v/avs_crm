-- Tracks renewal lineage: a policy created as the renewal of another points
-- back to it via renewed_from_policy_id. The partial unique index means a
-- given policy can only be the source of one renewal — trying to renew an
-- already-renewed policy hits this constraint (see the friendly 23505
-- handling in policyController.create).

ALTER TABLE policies ADD COLUMN renewed_from_policy_id INTEGER REFERENCES policies(id);

CREATE UNIQUE INDEX policies_renewed_from_policy_id_key
  ON policies(renewed_from_policy_id)
  WHERE renewed_from_policy_id IS NOT NULL;
