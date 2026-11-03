// Curated idea bank for the bulk evaluation entry page's "Ideas" picker
// (components/dashboard/evaluation/IdeaPicker.tsx). Organized by the same
// four pillars the report card already rates players on (Technical,
// Tactical, Physical, Mental), so a coach who rated a player low on
// Technical sees Technical categories front and center. Each category
// carries strength/weakness phrasings AND matching outcome/performance
// goal ideas — picking "First Touch" as a weakness and later opening
// Performance Goals surfaces a First-Touch-specific goal, not a random
// one, so an evaluation reads as one coherent assessment instead of four
// disconnected lists. getUsedCategoryIds() below is what makes that
// connection live: it scans a player's already-picked strengths/
// weaknesses and returns which categories they came from, so the Goals
// picker can lead with "Suggested for this player" instead of making the
// coach re-browse the whole library from scratch. The AI "Generate with
// AI" summary step already reads straight from these same report_data
// fields, so a summary built from picked ideas is automatically grounded
// in them too — no separate wiring needed there.

export type EvalIdeaPillar = 'technical' | 'tactical' | 'physical' | 'mental';

export type EvalIdeaCategory = {
  id: string;
  label: string;
  pillar: EvalIdeaPillar;
  strengths: string[];
  weaknesses: string[];
  outcomeGoals: string[];
  performanceGoals: string[];
};

export const EVAL_IDEA_PILLARS: { id: EvalIdeaPillar; label: string }[] = [
  { id: 'technical', label: 'Technical' },
  { id: 'tactical', label: 'Tactical' },
  { id: 'physical', label: 'Physical' },
  { id: 'mental', label: 'Mental' },
];

export const EVAL_IDEAS: EvalIdeaCategory[] = [
  // ---------- TECHNICAL ----------
  {
    id: 'first_touch', label: 'First Touch & Ball Control', pillar: 'technical',
    strengths: [
      'Cushions the ball instantly, even under tight pressure.',
      'Comfortable receiving on the half-turn and moving forward.',
      'Can control a difficult pass out of the air cleanly.',
    ],
    weaknesses: [
      'Ball bounces away on first touch under pressure.',
      'Needs to get the ball under control faster to keep tempo.',
      'Struggles to control passes played at pace or awkward height.',
    ],
    outcomeGoals: [
      "Go a full season without a heavy first touch costing possession in a key moment.",
      "Become the team's most reliable first-time receiver by spring.",
      'Make first touch a non-issue in every match by season\'s end.',
    ],
    performanceGoals: [
      'Complete 8 of 10 cushioned first touches under pressure in training.',
      'Practice receiving on the half-turn for 10 minutes after every session.',
      'Do a daily 5-minute wall-pass first-touch routine at home.',
    ],
  },
  {
    id: 'passing', label: 'Passing', pillar: 'technical',
    strengths: [
      'Picks out teammates with sharp, well-weighted passes.',
      'Switches play confidently to unbalance the defense.',
      'Plays quick, simple passes that keep the team moving.',
    ],
    weaknesses: [
      'Passes often go to feet instead of into space.',
      'Needs more variety — relies on the same short pass.',
      "Underhit or overhit passes break up the team's rhythm.",
    ],
    outcomeGoals: [
      "Finish the season in the team's top passers for completed passes.",
      'Complete at least one defense-splitting pass per game by the second half.',
      'Become the player teammates trust most to keep possession moving.',
    ],
    performanceGoals: [
      'Hit 8 of 10 reps on a weighted-pass drill before each training.',
      'Attempt one line-breaking pass every game, successful or not.',
      'Practice both-feet passing accuracy for 10 minutes before each session.',
    ],
  },
  {
    id: 'dribbling', label: 'Dribbling & 1v1 Attacking', pillar: 'technical',
    strengths: [
      'Beats defenders one-on-one with quick, confident moves.',
      'Shields the ball well and draws fouls under pressure.',
      'Comfortable carrying the ball at speed through midfield.',
    ],
    weaknesses: [
      'Dribbles into traffic instead of looking for an outlet.',
      'Needs a reliable second move for when the first is read.',
      'Over-dribbles instead of releasing the ball at the right moment.',
    ],
    outcomeGoals: [
      "Become the team's most effective 1v1 attacker in the final third.",
      'Successfully beat a defender at least once in every match.',
      'Beat a defender 1v1 in at least half of attempts by spring.',
    ],
    performanceGoals: [
      'Add one new 1v1 move each month and use it in a game.',
      'Win 60% of 1v1 attacking duels in training scrimmages.',
      'Set a personal rule: two moves max before releasing the ball.',
    ],
  },
  {
    id: 'finishing', label: 'Finishing & Shooting', pillar: 'technical',
    strengths: [
      'Clinical in front of goal — makes chances count.',
      'Strikes the ball cleanly with real power and accuracy.',
      'Composed in one-on-one situations with the goalkeeper.',
    ],
    weaknesses: [
      'Rushes shots instead of picking a corner.',
      'Needs to get more shots away instead of passing up chances.',
      'Shoots too early instead of picking the best angle.',
    ],
    outcomeGoals: [
      'Reach double-digit goals by the end of the season.',
      'Convert at least one clear chance in every other match.',
      "Become the team's most reliable finisher inside the box.",
    ],
    performanceGoals: [
      'Take 20 extra finishing reps after every training session.',
      'Hit the target with 7 of 10 shots in the finishing drill.',
      'Practice first-time finishing off a service ball every training.',
    ],
  },
  {
    id: 'ball_striking', label: 'Ball Striking & Weak Foot', pillar: 'technical',
    strengths: [
      'Strikes the ball cleanly with both feet.',
      'Generates real power on shots and long passes alike.',
      'Can bend and curl the ball with real control.',
    ],
    weaknesses: [
      "Avoids using the weak foot even when it's the better option.",
      'Needs to follow through more on strikes for power and accuracy.',
      'Strikes often lack the follow-through to carry real power.',
    ],
    outcomeGoals: [
      'Score at least one goal with the weak foot this season.',
      'Become comfortable enough to pass under pressure with either foot.',
      'Score from distance at least once this season.',
    ],
    performanceGoals: [
      'Do 50 weak-foot touches and strikes after every training session.',
      'Use the weak foot on at least 2 reps in every finishing drill.',
      'Practice long-ball technique with both feet twice a week.',
    ],
  },
  {
    id: 'receiving', label: 'Receiving Under Pressure', pillar: 'technical',
    strengths: [
      'Stays calm and keeps the ball under tight marking.',
      'Opens the body well to receive and play forward in one motion.',
      'Finds an angle to receive instead of waiting side-on.',
    ],
    weaknesses: [
      'Loses the ball the moment a defender closes in.',
      'Needs to check shoulders before the ball arrives.',
      'Receives square-on, limiting options to play forward.',
    ],
    outcomeGoals: [
      'Become a reliable out-ball the team can play into under pressure.',
      "Cut turnovers receiving under pressure noticeably by season's end.",
      "Become the team's safest out-ball under a high press.",
    ],
    performanceGoals: [
      'Practice checking shoulders before every reception in small-sided games.',
      'Receive and retain the ball under pressure 8 of 10 times in training.',
      'Practice opening the body to receive on the half-turn every session.',
    ],
  },
  {
    id: 'heading', label: 'Heading & Aerial Ability', pillar: 'technical',
    strengths: [
      'Wins the majority of aerial duels against bigger opponents.',
      'Times jumps well to attack crosses at the peak.',
      'Heads the ball with real purpose, not just contact.',
    ],
    weaknesses: [
      'Avoids heading duels instead of competing for them.',
      'Times jumps early or late instead of at the peak.',
      'Heads lack direction — needs to aim, not just clear.',
    ],
    outcomeGoals: [
      'Score or prevent a goal in the air at least once this season.',
      'Become a genuine aerial threat at both ends of the field.',
      'Win the majority of headers contested this season.',
    ],
    performanceGoals: [
      'Practice heading technique and timing twice a week.',
      'Compete for every header in training, no avoiding contact.',
      'Work on directing headers to a target, not just clearing.',
    ],
  },

  // ---------- TACTICAL ----------
  {
    id: 'positioning', label: 'Positioning Off the Ball', pillar: 'tactical',
    strengths: [
      'Finds pockets of space defenders struggle to track.',
      'Times runs well to stay onside and get in behind.',
      'Occupies the right space to stretch the opposition.',
    ],
    weaknesses: [
      'Drifts out of position, making the team narrow or stretched.',
      'Needs to recognize space earlier instead of ball-watching.',
      'Bunches up with teammates instead of spreading the field.',
    ],
    outcomeGoals: [
      'Become a reliable option in the right space every phase of the game.',
      'Create at least one clear chance per game from smart positioning.',
      'Become a constant, reliable outlet in space all season.',
    ],
    performanceGoals: [
      'Work on scanning every 3-5 seconds during small-sided games.',
      'Practice timing runs off the shoulder of the last defender.',
      'Practice recognizing and filling space in every small-sided game.',
    ],
  },
  {
    id: 'decision_making', label: 'Decision-Making', pillar: 'tactical',
    strengths: [
      'Reads the moment well — knows when to pass, dribble, or shoot.',
      "Rarely forces plays that aren't on.",
      'Chooses the simple, effective option more often than not.',
    ],
    weaknesses: [
      'Holds the ball too long before deciding what to do.',
      'Needs to trust the first instinct instead of overthinking.',
      'Tries the difficult option when a simple one is on.',
    ],
    outcomeGoals: [
      'Cut unforced turnovers from indecision noticeably this season.',
      "Become one of the team's quickest, most reliable decision-makers on the ball.",
      'Make the right read in big moments more consistently.',
    ],
    performanceGoals: [
      'Set a personal rule: decide before the ball arrives, not after.',
      'Play one-touch or two-touch in at least half of training possessions.',
      'Review one decision from each match with the coach weekly.',
    ],
  },
  {
    id: 'game_reading', label: 'Game Reading & Scanning', pillar: 'tactical',
    strengths: [
      'Anticipates play before it happens and reacts a step early.',
      "Reads the opponent's shape and finds the gaps.",
      'Spots danger early and adjusts position before it arrives.',
    ],
    weaknesses: [
      'Reacts to the game instead of anticipating it.',
      'Needs to scan the field more before receiving the ball.',
      'Gets caught out by runs that teammates spot earlier.',
    ],
    outcomeGoals: [
      'Become the player teammates trust to spot the right pass first.',
      "Make noticeably fewer reactive, last-second decisions by season's end.",
      'Become the player who sees the next pass before anyone else.',
    ],
    performanceGoals: [
      'Scan the field at least once before every touch in training.',
      "Call out what's developing on the field, not just react to it.",
      'Practice naming the next two passes out loud during drills.',
    ],
  },
  {
    id: 'transition', label: 'Transition Play', pillar: 'tactical',
    strengths: [
      'Reacts instantly when possession changes, in both directions.',
      'Sprints back on defense the moment the ball is lost.',
      'First to react when the ball changes hands.',
    ],
    weaknesses: [
      'Slow to react when possession changes either way.',
      'Needs to sprint in transition instead of jogging back.',
      'Ball-watches instead of reacting the instant possession turns over.',
    ],
    outcomeGoals: [
      'Become one of the fastest players to react in transition moments.',
      'Win the ball back within 5 seconds of losing it more consistently.',
      "Become a key piece of the team's counter-attack all season.",
    ],
    performanceGoals: [
      'Sprint the first 10 yards of every transition in training, no exceptions.',
      'Practice the counter-press trigger: ball lost, immediate pressure, every rep.',
      'Practice the first-three-steps sprint on every transition drill.',
    ],
  },
  {
    id: 'defensive_shape', label: 'Defensive Shape & Pressing', pillar: 'tactical',
    strengths: [
      'Holds a disciplined defensive shape and presses as a team.',
      'Closes down ball carriers with good angles, not just speed.',
      'Stays compact and trusts the team\'s defensive structure.',
    ],
    weaknesses: [
      'Presses alone instead of waiting for the team trigger.',
      'Needs to hold defensive shape instead of chasing the ball.',
      'Breaks the line too early, opening gaps behind.',
    ],
    outcomeGoals: [
      "Become a reliable, disciplined piece of the team's defensive shape.",
      "Help the team keep more clean sheets through better shape and pressing.",
      'Become one of the most disciplined defenders on the roster.',
    ],
    performanceGoals: [
      "Practice pressing on the coach's trigger, not before, every training.",
      'Work on closing down at an angle that cuts off the pass, not just the dribble.',
      'Practice staying connected to the backline in every scrimmage.',
    ],
  },
  {
    id: 'set_pieces', label: 'Set Pieces', pillar: 'tactical',
    strengths: [
      'Dangerous on set pieces — delivery and movement are both sharp.',
      'Wins the ball consistently in the air at corners.',
      'Reads flight and timing well on crosses and corners.',
    ],
    weaknesses: [
      'Loses focus and marks loosely at defensive set pieces.',
      'Needs to attack the ball more aggressively at corners.',
      'Ball-watches on set pieces instead of tracking a run.',
    ],
    outcomeGoals: [
      'Score or assist from a set piece at least twice this season.',
      "Become the team's most reliable set-piece defender.",
      'Become a genuine set-piece threat at both ends of the field.',
    ],
    performanceGoals: [
      'Practice near-post runs on corners every training session.',
      'Work on delivery technique — 10 extra corner kicks after practice.',
      'Practice heading technique and timing twice a week.',
    ],
  },
  {
    id: 'crossing', label: 'Crossing & Final Ball', pillar: 'tactical',
    strengths: [
      'Delivers dangerous crosses that create real chances.',
      "Picks out a teammate's run with the final ball consistently.",
      'Varies delivery well between early and driven crosses.',
    ],
    weaknesses: [
      'Crosses are hit too hard or too high to be useful.',
      'Needs to look up before crossing instead of crossing blind.',
      'Relies on one type of delivery — needs more variety.',
    ],
    outcomeGoals: [
      'Record multiple assists from crosses and final balls this season.',
      "Become the team's most reliable source of service from wide areas.",
      'Create a clear chance from a cross in most matches.',
    ],
    performanceGoals: [
      'Practice crossing technique from both sides, 15 reps after training.',
      'Look up before every cross to pick a target in practice.',
      'Work on early crosses before the fullback can recover.',
    ],
  },

  // ---------- PHYSICAL ----------
  {
    id: 'pace', label: 'Pace & Speed', pillar: 'physical',
    strengths: [
      'Genuine pace that stretches defenses and wins foot races.',
      'Explosive over the first few yards.',
      'Closes down space quickly when chasing the ball back.',
    ],
    weaknesses: [
      "Pace alone isn't enough — needs better timing on runs.",
      'Needs to build top-end speed over longer distances.',
      'Needs to recognize sooner when pace can be used to attack space.',
    ],
    outcomeGoals: [
      "Become the team's most consistent out-ball in behind the defense.",
      'Use pace to create at least one clear chance per game.',
      "Become the team's go-to outlet for pace in behind.",
    ],
    performanceGoals: [
      'Add two sprint-interval sessions a week outside of practice.',
      'Practice timing runs so pace is used at the right moment, not wasted.',
      'Add acceleration drills to the pre-training warmup twice a week.',
    ],
  },
  {
    id: 'strength', label: 'Strength & Physicality', pillar: 'physical',
    strengths: [
      'Wins physical duels and holds up play under pressure.',
      'Hard to knock off the ball in tight areas.',
      'Competes well in the air and on the ground physically.',
    ],
    weaknesses: [
      'Gets outmuscled in physical battles for the ball.',
      'Needs to use body positioning better to shield possession.',
      'Backs down from contact instead of competing through it.',
    ],
    outcomeGoals: [
      "Become noticeably harder to dispossess by the second half of the season.",
      'Win the majority of physical duels in matches by spring.',
      'Become noticeably more competitive in physical duels by spring.',
    ],
    performanceGoals: [
      'Add light strength and core work twice a week outside of practice.',
      'Practice shielding the ball under contact in every small-sided game.',
      'Practice holding off a defender in 1v1 shielding drills every session.',
    ],
  },
  {
    id: 'agility', label: 'Agility & Change of Direction', pillar: 'physical',
    strengths: [
      'Quick feet and sharp changes of direction in tight spaces.',
      'Hard to pin down one-on-one thanks to quick footwork.',
      'Reacts quickly to sudden changes in play.',
    ],
    weaknesses: [
      'Movement is a bit stiff — needs quicker changes of direction.',
      'Gets caught flat-footed when the play changes suddenly.',
      'Takes an extra step to change direction compared to teammates.',
    ],
    outcomeGoals: [
      'Become noticeably sharper in 1v1 situations through improved footwork.',
      'Cut down on being caught flat-footed in defensive transitions.',
      'Move noticeably more fluidly in tight spaces by season\'s end.',
    ],
    performanceGoals: [
      'Add 10 minutes of agility-ladder work before every training session.',
      'Practice quick changes of direction in every dribbling drill.',
      'Add cone and agility work to the pre-training routine.',
    ],
  },
  {
    id: 'stamina', label: 'Stamina & Work Rate', pillar: 'physical',
    strengths: [
      'Covers ground all game without dropping off physically.',
      'Still sharp and sprinting in the final 10 minutes.',
      'Recovers quickly between sprints and stays effective.',
    ],
    weaknesses: [
      'Work rate drops noticeably in the second half.',
      'Needs better conditioning to keep up the tempo for a full match.',
      'Needs more in the tank for the final quarter of matches.',
    ],
    outcomeGoals: [
      'Maintain the same work rate late in matches as early on, all season.',
      'Become known as one of the fittest players on the team.',
      'Play every minute of every match at a consistent level.',
    ],
    performanceGoals: [
      'Add one extra conditioning session per week outside of practice.',
      'Finish every training session with the same intensity it started.',
      'Add a weekly endurance run outside of normal training.',
    ],
  },
  {
    id: 'balance', label: 'Balance & Coordination', pillar: 'physical',
    strengths: [
      'Strong balance lets them stay on the ball through contact.',
      'Coordinated in the air and on the ground alike.',
      'Recovers quickly after contact without losing the ball.',
    ],
    weaknesses: [
      'Loses balance easily when challenged while dribbling.',
      'Needs better body control when turning at speed.',
      'Goes down too easily under light contact.',
    ],
    outcomeGoals: [
      "Become noticeably harder to knock off balance by season's end.",
      'Win more 50/50 balls through improved body control.',
      'Stay on the ball through contact more consistently this season.',
    ],
    performanceGoals: [
      'Add balance and core stability work twice a week outside of practice.',
      'Practice turning at speed under light pressure every training.',
      'Practice single-leg balance drills twice a week.',
    ],
  },

  // ---------- MENTAL ----------
  {
    id: 'effort', label: 'Work Rate & Effort', pillar: 'mental',
    strengths: [
      'Never stops working to win the ball back.',
      'Sets the tone with relentless effort every session.',
      'First to every loose ball and every sprint.',
    ],
    weaknesses: [
      'Effort dips when the team is behind or tired.',
      'Needs to bring the same energy for the full match.',
      "Coasts in moments the game isn't directly in front of them.",
    ],
    outcomeGoals: [
      'Become known as one of the hardest workers on the team.',
      'Keep effort consistent regardless of the scoreline, all season.',
      "Finish the season as one of the team's top effort performers.",
    ],
    performanceGoals: [
      'Sprint back on every defensive transition in training, no exceptions.',
      'Set a personal standard: finish every drill at full effort.',
      'Track personal effort after every session with a simple 1-5 rating.',
    ],
  },
  {
    id: 'communication', label: 'Communication', pillar: 'mental',
    strengths: [
      'Talks constantly, organizing teammates and calling for the ball.',
      'Clear, positive communication that lifts the team.',
      'Gives teammates useful information before they need it.',
    ],
    weaknesses: [
      "Plays too quietly — teammates don't always know what's coming.",
      'Needs to call for the ball and organize teammates more.',
      'Stays silent during moments that need a loud, clear call.',
    ],
    outcomeGoals: [
      'Become one of the most vocal organizers on the field.',
      'Help cut team communication errors in defense through better calls.',
      'Become a go-to voice for organizing the team in matches.',
    ],
    performanceGoals: [
      'Call for the ball out loud on every attacking possession in training.',
      'Practice organizing the backline verbally during every scrimmage.',
      "Practice calling 'man on' or 'time' on every relevant rep.",
    ],
  },
  {
    id: 'composure', label: 'Composure Under Pressure', pillar: 'mental',
    strengths: [
      'Stays calm and makes good decisions even under heavy pressure.',
      "Doesn't rattle when the game gets physical or close.",
      'Slows the game down mentally when things get chaotic.',
    ],
    weaknesses: [
      'Rushes decisions and loses composure under pressure.',
      'Needs to slow the game down mentally in tight moments.',
      'Visibly rattled after a mistake or a tough tackle.',
    ],
    outcomeGoals: [
      'Become the player teammates look to when the game gets tense.',
      'Make noticeably fewer panicked decisions under pressure this season.',
      'Handle high-pressure moments the same way as low-pressure ones.',
    ],
    performanceGoals: [
      'Practice one extra touch before releasing the ball under pressure.',
      'Use a pre-game breathing routine to stay calm from kickoff.',
      'Practice a specific routine to reset after every mistake.',
    ],
  },
  {
    id: 'leadership', label: 'Leadership', pillar: 'mental',
    strengths: [
      "Leads by example and lifts teammates' energy.",
      'Takes responsibility and helps organize the team on the field.',
      'Steps up and sets the tone in big moments.',
    ],
    weaknesses: [
      'Leads quietly by play alone — could do more vocally.',
      "Needs to take more ownership when things aren't going well.",
      'Lets frustration show instead of leading through it.',
    ],
    outcomeGoals: [
      "Become one of the team's clear on-field leaders by season's end.",
      'Help younger or newer teammates settle in through mentorship.',
      'Be looked to as a captain-level presence by season\'s end.',
    ],
    performanceGoals: [
      'Check in with a struggling teammate at least once every training.',
      'Practice giving one piece of specific, positive feedback to a teammate each session.',
      'Practice staying positive and vocal for the entire match, not just when winning.',
    ],
  },
  {
    id: 'competitiveness', label: 'Competitiveness & Resilience', pillar: 'mental',
    strengths: [
      'Competes for every ball and hates losing even small battles.',
      'Bounces back quickly from mistakes without dropping the head.',
      'Treats every drill and scrimmage like it matters.',
    ],
    weaknesses: [
      'Gets discouraged and disengages after a mistake.',
      'Needs to compete harder for 50/50 balls.',
      'Takes losing badly in a way that affects the next play.',
    ],
    outcomeGoals: [
      'Become known as one of the toughest competitors on the team.',
      'Cut the time it takes to refocus after a mistake to seconds.',
      'Channel competitiveness into performance, not frustration, all season.',
    ],
    performanceGoals: [
      'Practice a quick reset routine — one breath, next play — after every mistake in training.',
      'Compete for every 50/50 ball in scrimmages, no exceptions.',
      'Practice a specific routine for handling a bad call or tough loss.',
    ],
  },
  {
    id: 'coachability', label: 'Coachability & Response to Feedback', pillar: 'mental',
    strengths: [
      'Takes coaching well and applies it immediately in the next rep.',
      'Asks good questions and genuinely wants to improve.',
      'Seeks out extra feedback instead of waiting for it.',
    ],
    weaknesses: [
      'Needs to apply feedback in the moment instead of repeating the same mistake.',
      'Can be defensive about corrections instead of taking them on board.',
      'Needs reminders more than once before a change sticks.',
    ],
    outcomeGoals: [
      'Become one of the most consistently improving players on the roster.',
      'Visibly apply at least one coaching point from every session into matches.',
      'Become a model for how to take and apply coaching.',
    ],
    performanceGoals: [
      'Write down one coaching point after every practice and review it before the next.',
      'Ask one clarifying question per session to better understand feedback.',
      'Set one specific, trackable goal with the coach every month.',
    ],
  },
  {
    id: 'focus', label: 'Focus & Concentration', pillar: 'mental',
    strengths: [
      'Stays switched on for the full match, not just key moments.',
      'Rarely loses track of their job even when the ball is far away.',
      'Keeps concentration even when the game is one-sided.',
    ],
    weaknesses: [
      'Drifts mentally when the ball is on the other side of the field.',
      'Loses concentration late in matches or lopsided scorelines.',
      'Needs to stay switched on even in low-involvement moments.',
    ],
    outcomeGoals: [
      'Avoid costly lapses in concentration for a full season.',
      'Maintain the same focus in the final minutes as the first.',
      'Become known as one of the most consistently switched-on players.',
    ],
    performanceGoals: [
      'Practice a mental check-in every few minutes during scrimmages.',
      'Set a personal cue to refocus whenever the ball goes away.',
      'Track focus lapses after matches and review them with the coach.',
    ],
  },
];

// Scans a player's already-entered strengths/weaknesses and returns which
// idea categories they came from (exact phrase match against the library),
// so the Goals pickers can lead with suggestions grounded in THIS player's
// evaluation instead of a generic, disconnected browse. A coach editing a
// picked phrase breaks the match for that one entry — an acceptable
// tradeoff for not guessing at fuzzy/partial matches.
export function getUsedCategoryIds(strengths: string[], weaknesses: string[]): string[] {
  const strengthSet = new Set(strengths.map(s => s.trim()).filter(Boolean));
  const weaknessSet = new Set(weaknesses.map(s => s.trim()).filter(Boolean));
  const ids: string[] = [];
  for (const cat of EVAL_IDEAS) {
    const matches = cat.strengths.some(p => strengthSet.has(p)) || cat.weaknesses.some(p => weaknessSet.has(p));
    if (matches) ids.push(cat.id);
  }
  return ids;
}
