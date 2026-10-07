-- custom_branding and fee_collection were seeded at min_plan_id='free',
-- but every real call site (fees/page.tsx, settings/page.tsx's Branding
-- tab) already renders an UpgradePrompt that says "Available on Team Pro"
-- — the catalog row just never matched. Team Pro's own marketing bullet
-- list already includes both; Free's doesn't. Confirmed zero live impact:
-- no club has a paid plan yet, and the two Free-tier clubs (Riverside FC,
-- STRYKERS) have zero fee records between them; STRYKERS' existing logo/
-- colors keep rendering either way since canUse('branding') only gates
-- the editor, not display.
update public.plan_features set min_plan_id = 'team_pro'
  where key in ('custom_branding', 'fee_collection');
