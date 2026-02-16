-- Fix deterministic RentAHuman enrichments: change 0 scores to NULL
-- so AVG() aggregations correctly ignore these non-scored actions.
UPDATE enrichments
SET sentiment = NULL,
    autonomy_score = NULL,
    originality_score = NULL,
    independence_score = NULL,
    coordination_signal = NULL
WHERE model = 'deterministic-rentahuman-v1';
