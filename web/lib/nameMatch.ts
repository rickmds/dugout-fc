// Recognizes that "Rick Breheny" and "Richard Breheny" are very likely the
// same person — coaches often get extracted from multiple source documents
// that refer to them differently (a formal team-mapping list vs. a roster
// PDF's "Head Coach: <nickname>" line). Exact-string matching alone can't
// catch this, and there's no name-matching library worth adding as a
// dependency for such a small, well-known problem — a short common-nickname
// table covers the vast majority of real cases.
const NICKNAME_GROUPS: string[][] = [
  ['richard', 'rick', 'rich', 'ricky', 'dick'],
  ['robert', 'rob', 'bob', 'bobby', 'robbie'],
  ['william', 'will', 'bill', 'billy', 'liam'],
  ['james', 'jim', 'jimmy', 'jamie'],
  ['michael', 'mike', 'mikey', 'mick'],
  ['christopher', 'chris'],
  ['matthew', 'matt'],
  ['joseph', 'joe', 'joey'],
  ['daniel', 'dan', 'danny'],
  ['anthony', 'tony'],
  ['thomas', 'tom', 'tommy'],
  ['charles', 'charlie', 'chuck'],
  ['edward', 'ed', 'eddie', 'ted'],
  ['benjamin', 'ben', 'benny'],
  ['alexander', 'alex'],
  ['nicholas', 'nick', 'nicky'],
  ['patrick', 'pat'],
  ['timothy', 'tim', 'timmy'],
  ['andrew', 'andy', 'drew'],
  ['david', 'dave', 'davey'],
  ['gregory', 'greg'],
  ['jonathan', 'jon', 'jonny'],
  ['joshua', 'josh'],
  ['kenneth', 'ken', 'kenny'],
  ['lawrence', 'larry'],
  ['ronald', 'ron', 'ronnie'],
  ['samuel', 'sam', 'sammy'],
  ['stephen', 'steven', 'steve'],
  ['zachary', 'zach', 'zack'],
  ['jennifer', 'jen', 'jenny'],
  ['elizabeth', 'liz', 'beth', 'eliza', 'lisa', 'betty'],
  ['katherine', 'catherine', 'kate', 'katie', 'kathy', 'cathy'],
  ['margaret', 'maggie', 'peggy', 'meg'],
  ['jessica', 'jess'],
  ['samantha', 'sam', 'sammy'],
  ['rebecca', 'becky'],
  ['stephanie', 'steph'],
  ['victoria', 'vicky', 'tori'],
  ['patricia', 'pat', 'patty', 'trish'],
  ['deborah', 'debbie', 'deb'],
  ['barbara', 'barb'],
  ['cynthia', 'cindy'],
  ['christine', 'christina', 'chris', 'tina'],
];

const NICKNAME_LOOKUP = new Map<string, Set<string>>();
for (const group of NICKNAME_GROUPS) {
  const all = new Set(group);
  for (const name of group) NICKNAME_LOOKUP.set(name, all);
}

function firstNameVariants(first: string): Set<string> {
  return NICKNAME_LOOKUP.get(first) ?? new Set([first]);
}

// True if `a` and `b` plausibly name the same person — exact match, or a
// shared last name with a first name that's a known nickname/formal-name
// variant of the other.
export function sameCoachName(a: string, b: string): boolean {
  const na = a.trim().toLowerCase().replace(/\s+/g, ' ');
  const nb = b.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!na || !nb) return false;
  if (na === nb) return true;

  const [aFirst, ...aRest] = na.split(' ');
  const [bFirst, ...bRest] = nb.split(' ');
  const aLast = aRest.join(' ');
  const bLast = bRest.join(' ');
  if (!aLast || aLast !== bLast) return false;

  return firstNameVariants(aFirst).has(bFirst);
}
