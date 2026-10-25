-- New disaster lineup (disasters track, 2026-10-25): flood is gone, the old falling-rock
-- meteor became "fat-guy", "meteor" now flies in from the side, plus tornado and cat.
-- Must match DisasterType in src/lib/supabase/types.ts.

alter table daily_puzzle drop constraint if exists daily_puzzle_disaster_type_check;

-- Stored flood days can't be played any more; the game regenerates a day it can't read.
delete from daily_puzzle where disaster_type = 'flood';

alter table daily_puzzle add constraint daily_puzzle_disaster_type_check
  check (disaster_type in ('wind', 'earthquake', 'fat-guy', 'meteor', 'tornado', 'cat'));
