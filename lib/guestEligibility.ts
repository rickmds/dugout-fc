// Guest-player eligibility between two teams — used to badge (never hide)
// teams/players in the guest-invite and call-out pickers. Judged at the
// team level since players have no gender field of their own, only teams
// do ('boys' | 'girls' | 'mixed' | null).

export function parseAgeGroup(ageGroup: string | null): number | null {
  if (!ageGroup) return null;
  const m = ageGroup.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// A team can pull guests from any team the same age or younger (players
// playing up is the normal case — most of that roster is actually
// eligible). A team one age group older is deliberately NOT counted as
// eligible here even though it's still shown in the picker (nothing is
// ever hidden) — only a player or two on an older roster would actually
// be young enough to qualify, not the team as a whole, so it should read
// as "check before using" rather than a clean match. Either side missing
// a parseable age is treated as eligible — never hide over data we can't
// evaluate.
export function isAgeEligible(myAgeGroup: string | null, targetAgeGroup: string | null): boolean {
  const my = parseAgeGroup(myAgeGroup);
  const target = parseAgeGroup(targetAgeGroup);
  if (my == null || target == null) return true;
  return target <= my;
}

// Girls can guest for a boys or mixed team; boys cannot guest for a girls
// team. Either side missing a gender is treated as eligible.
export function isGenderEligible(myGender: string | null, targetGender: string | null): boolean {
  if (!myGender || !targetGender) return true;
  if (myGender === 'girls') return targetGender === 'girls';
  return true; // myGender is 'boys' or 'mixed' — boys/girls/mixed all fine
}

export function isEligibleTeam(
  my: { age_group: string | null; gender: string | null },
  target: { age_group: string | null; gender: string | null }
): boolean {
  return isAgeEligible(my.age_group, target.age_group) && isGenderEligible(my.gender, target.gender);
}
