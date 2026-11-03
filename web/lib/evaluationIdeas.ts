// Curated idea bank for the bulk evaluation entry page's "Ideas" picker
// (components/dashboard/evaluation/IdeaPicker.tsx). Organized by the same
// four pillars the report card already rates players on (Technical,
// Tactical, Physical, Mental), so a coach who rated a player low on
// Technical sees Technical categories front and center. Each category
// carries strength/weakness phrasings AND matching outcome/performance
// goal ideas — picking "First Touch" as a weakness and later opening
// Performance Goals surfaces a First-Touch-specific goal, not a random
// one, so an evaluation reads as one coherent assessment instead of four
// disconnected lists. The AI "Generate with AI" summary step already
// reads straight from these same report_data fields, so a summary built
// from picked ideas is automatically grounded in them too — no separate
// wiring needed there.

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
    ],
    weaknesses: [
      'Ball bounces away on first touch under pressure.',
      'Needs to get the ball under control faster to keep tempo.',
    ],
    outcomeGoals: [
      "Go a full season without a heavy first touch costing possession in a key moment.",
      "Become the team's most reliable first-time receiver by spring.",
    ],
    performanceGoals: [
      'Complete 8 of 10 cushioned first touches under pressure in training.',
      'Practice receiving on the half-turn for 10 minutes after every session.',
    ],
  },
  {
    id: 'passing', label: 'Passing', pillar: 'technical',
    strengths: [
      'Picks out teammates with sharp, well-weighted passes.',
      'Switches play confidently to unbalance the defense.',
    ],
    weaknesses: [
      'Passes often go to feet instead of into space.',
      'Needs more variety — relies on the same short pass.',
    ],
    outcomeGoals: [
      "Finish the season in the team's top passers for completed passes.",
      'Complete at least one defense-splitting pass per game by the second half.',
    ],
    performanceGoals: [
      'Hit 8 of 10 reps on a weighted-pass drill before each training.',
      'Attempt one line-breaking pass every game, successful or not.',
    ],
  },
  {
    id: 'dribbling', label: 'Dribbling & 1v1 Attacking', pillar: 'technical',
    strengths: [
      'Beats defenders one-on-one with quick, confident moves.',
      'Shields the ball well and draws fouls under pressure.',
    ],
    weaknesses: [
      'Dribbles into traffic instead of looking for an outlet.',
      'Needs a reliable second move for when the first is read.',
    ],
    outcomeGoals: [
      "Become the team's most effective 1v1 attacker in the final third.",
      'Successfully beat a defender at least once in every match.',
    ],
    performanceGoals: [
      'Add one new 1v1 move each month and use it in a game.',
      'Win 60% of 1v1 attacking duels in training scrimmages.',
    ],
  },
  {
    id: 'finishing', label: 'Finishing & Shooting', pillar: 'technical',
    strengths: [
      'Clinical in front of goal — makes chances count.',
      'Strikes the ball cleanly with real power and accuracy.',
    ],
    weaknesses: [
      'Rushes shots instead of picking a corner.',
      'Needs to get more shots away instead of passing up chances.',
    ],
    outcomeGoals: [
      'Reach double-digit goals by the end of the season.',
      'Convert at least one clear chance in every other match.',
    ],
    performanceGoals: [
      'Take 20 extra finishing reps after every training session.',
      'Hit the target with 7 of 10 shots in the finishing drill.',
    ],
  },
  {
    id: 'ball_striking', label: 'Ball Striking & Weak Foot', pillar: 'technical',
    strengths: [
      'Strikes the ball cleanly with both feet.',
      'Generates real power on shots and long passes alike.',
    ],
    weaknesses: [
      "Avoids using the weak foot even when it's the better option.",
      'Needs to follow through more on strikes for power and accuracy.',
    ],
    outcomeGoals: [
      'Score at least one goal with the weak foot this season.',
      'Become comfortable enough to pass under pressure with either foot.',
    ],
    performanceGoals: [
      'Do 50 weak-foot touches and strikes after every training session.',
      'Use the weak foot on at least 2 reps in every finishing drill.',
    ],
  },
  {
    id: 'receiving', label: 'Receiving Under Pressure', pillar: 'technical',
    strengths: [
      'Stays calm and keeps the ball under tight marking.',
      'Opens the body well to receive and play forward in one motion.',
    ],
    weaknesses: [
      'Loses the ball the moment a defender closes in.',
      'Needs to check shoulders before the ball arrives.',
    ],
    outcomeGoals: [
      'Become a reliable out-ball the team can play into under pressure.',
      "Cut turnovers receiving under pressure noticeably by season's end.",
    ],
    performanceGoals: [
      'Practice checking shoulders before every reception in small-sided games.',
      'Receive and retain the ball under pressure 8 of 10 times in training.',
    ],
  },

  // ---------- TACTICAL ----------
  {
    id: 'positioning', label: 'Positioning Off the Ball', pillar: 'tactical',
    strengths: [
      'Finds pockets of space defenders struggle to track.',
      'Times runs well to stay onside and get in behind.',
    ],
    weaknesses: [
      'Drifts out of position, making the team narrow or stretched.',
      'Needs to recognize space earlier instead of ball-watching.',
    ],
    outcomeGoals: [
      'Become a reliable option in the right space every phase of the game.',
      'Create at least one clear chance per game from smart positioning.',
    ],
    performanceGoals: [
      'Work on scanning every 3-5 seconds during small-sided games.',
      'Practice timing runs off the shoulder of the last defender.',
    ],
  },
  {
    id: 'decision_making', label: 'Decision-Making', pillar: 'tactical',
    strengths: [
      'Reads the moment well — knows when to pass, dribble, or shoot.',
      "Rarely forces plays that aren't on.",
    ],
    weaknesses: [
      'Holds the ball too long before deciding what to do.',
      'Needs to trust the first instinct instead of overthinking.',
    ],
    outcomeGoals: [
      'Cut unforced turnovers from indecision noticeably this season.',
      "Become one of the team's quickest, most reliable decision-makers on the ball.",
    ],
    performanceGoals: [
      'Set a personal rule: decide before the ball arrives, not after.',
      'Play one-touch or two-touch in at least half of training possessions.',
    ],
  },
  {
    id: 'game_reading', label: 'Game Reading & Scanning', pillar: 'tactical',
    strengths: [
      'Anticipates play before it happens and reacts a step early.',
      "Reads the opponent's shape and finds the gaps.",
    ],
    weaknesses: [
      'Reacts to the game instead of anticipating it.',
      'Needs to scan the field more before receiving the ball.',
    ],
    outcomeGoals: [
      'Become the player teammates trust to spot the right pass first.',
      "Make noticeably fewer reactive, last-second decisions by season's end.",
    ],
    performanceGoals: [
      'Scan the field at least once before every touch in training.',
      "Call out what's developing on the field, not just react to it.",
    ],
  },
  {
    id: 'transition', label: 'Transition Play', pillar: 'tactical',
    strengths: [
      'Reacts instantly when possession changes, in both directions.',
      'Sprints back on defense the moment the ball is lost.',
    ],
    weaknesses: [
      'Slow to react when possession changes either way.',
      'Needs to sprint in transition instead of jogging back.',
    ],
    outcomeGoals: [
      'Become one of the fastest players to react in transition moments.',
      'Win the ball back within 5 seconds of losing it more consistently.',
    ],
    performanceGoals: [
      'Sprint the first 10 yards of every transition in training, no exceptions.',
      'Practice the counter-press trigger: ball lost, immediate pressure, every rep.',
    ],
  },
  {
    id: 'defensive_shape', label: 'Defensive Shape & Pressing', pillar: 'tactical',
    strengths: [
      'Holds a disciplined defensive shape and presses as a team.',
      'Closes down ball carriers with good angles, not just speed.',
    ],
    weaknesses: [
      'Presses alone instead of waiting for the team trigger.',
      'Needs to hold defensive shape instead of chasing the ball.',
    ],
    outcomeGoals: [
      "Become a reliable, disciplined piece of the team's defensive shape.",
      "Help the team keep more clean sheets through better shape and pressing.",
    ],
    performanceGoals: [
      "Practice pressing on the coach's trigger, not before, every training.",
      'Work on closing down at an angle that cuts off the pass, not just the dribble.',
    ],
  },
  {
    id: 'set_pieces', label: 'Set Pieces', pillar: 'tactical',
    strengths: [
      'Dangerous on set pieces — delivery and movement are both sharp.',
      'Wins the ball consistently in the air at corners.',
    ],
    weaknesses: [
      'Loses focus and marks loosely at defensive set pieces.',
      'Needs to attack the ball more aggressively at corners.',
    ],
    outcomeGoals: [
      'Score or assist from a set piece at least twice this season.',
      "Become the team's most reliable set-piece defender.",
    ],
    performanceGoals: [
      'Practice near-post runs on corners every training session.',
      'Work on delivery technique — 10 extra corner kicks after practice.',
    ],
  },

  // ---------- PHYSICAL ----------
  {
    id: 'pace', label: 'Pace & Speed', pillar: 'physical',
    strengths: [
      'Genuine pace that stretches defenses and wins foot races.',
      'Explosive over the first few yards.',
    ],
    weaknesses: [
      "Pace alone isn't enough — needs better timing on runs.",
      'Needs to build top-end speed over longer distances.',
    ],
    outcomeGoals: [
      "Become the team's most consistent out-ball in behind the defense.",
      'Use pace to create at least one clear chance per game.',
    ],
    performanceGoals: [
      'Add two sprint-interval sessions a week outside of practice.',
      'Practice timing runs so pace is used at the right moment, not wasted.',
    ],
  },
  {
    id: 'strength', label: 'Strength & Physicality', pillar: 'physical',
    strengths: [
      'Wins physical duels and holds up play under pressure.',
      'Hard to knock off the ball in tight areas.',
    ],
    weaknesses: [
      'Gets outmuscled in physical battles for the ball.',
      'Needs to use body positioning better to shield possession.',
    ],
    outcomeGoals: [
      "Become noticeably harder to dispossess by the second half of the season.",
      'Win the majority of physical duels in matches by spring.',
    ],
    performanceGoals: [
      'Add light strength and core work twice a week outside of practice.',
      'Practice shielding the ball under contact in every small-sided game.',
    ],
  },
  {
    id: 'agility', label: 'Agility & Change of Direction', pillar: 'physical',
    strengths: [
      'Quick feet and sharp changes of direction in tight spaces.',
      'Hard to pin down one-on-one thanks to quick footwork.',
    ],
    weaknesses: [
      'Movement is a bit stiff — needs quicker changes of direction.',
      'Gets caught flat-footed when the play changes suddenly.',
    ],
    outcomeGoals: [
      'Become noticeably sharper in 1v1 situations through improved footwork.',
      'Cut down on being caught flat-footed in defensive transitions.',
    ],
    performanceGoals: [
      'Add 10 minutes of agility-ladder work before every training session.',
      'Practice quick changes of direction in every dribbling drill.',
    ],
  },
  {
    id: 'stamina', label: 'Stamina & Work Rate', pillar: 'physical',
    strengths: [
      'Covers ground all game without dropping off physically.',
      'Still sharp and sprinting in the final 10 minutes.',
    ],
    weaknesses: [
      'Work rate drops noticeably in the second half.',
      'Needs better conditioning to keep up the tempo for a full match.',
    ],
    outcomeGoals: [
      'Maintain the same work rate late in matches as early on, all season.',
      'Become known as one of the fittest players on the team.',
    ],
    performanceGoals: [
      'Add one extra conditioning session per week outside of practice.',
      'Finish every training session with the same intensity it started.',
    ],
  },
  {
    id: 'balance', label: 'Balance & Coordination', pillar: 'physical',
    strengths: [
      'Strong balance lets them stay on the ball through contact.',
      'Coordinated in the air and on the ground alike.',
    ],
    weaknesses: [
      'Loses balance easily when challenged while dribbling.',
      'Needs better body control when turning at speed.',
    ],
    outcomeGoals: [
      "Become noticeably harder to knock off balance by season's end.",
      'Win more 50/50 balls through improved body control.',
    ],
    performanceGoals: [
      'Add balance and core stability work twice a week outside of practice.',
      'Practice turning at speed under light pressure every training.',
    ],
  },

  // ---------- MENTAL ----------
  {
    id: 'effort', label: 'Work Rate & Effort', pillar: 'mental',
    strengths: [
      'Never stops working to win the ball back.',
      'Sets the tone with relentless effort every session.',
    ],
    weaknesses: [
      'Effort dips when the team is behind or tired.',
      'Needs to bring the same energy for the full match.',
    ],
    outcomeGoals: [
      'Become known as one of the hardest workers on the team.',
      'Keep effort consistent regardless of the scoreline, all season.',
    ],
    performanceGoals: [
      'Sprint back on every defensive transition in training, no exceptions.',
      'Set a personal standard: finish every drill at full effort.',
    ],
  },
  {
    id: 'communication', label: 'Communication', pillar: 'mental',
    strengths: [
      'Talks constantly, organizing teammates and calling for the ball.',
      'Clear, positive communication that lifts the team.',
    ],
    weaknesses: [
      "Plays too quietly — teammates don't always know what's coming.",
      'Needs to call for the ball and organize teammates more.',
    ],
    outcomeGoals: [
      'Become one of the most vocal organizers on the field.',
      'Help cut team communication errors in defense through better calls.',
    ],
    performanceGoals: [
      'Call for the ball out loud on every attacking possession in training.',
      'Practice organizing the backline verbally during every scrimmage.',
    ],
  },
  {
    id: 'composure', label: 'Composure Under Pressure', pillar: 'mental',
    strengths: [
      'Stays calm and makes good decisions even under heavy pressure.',
      "Doesn't rattle when the game gets physical or close.",
    ],
    weaknesses: [
      'Rushes decisions and loses composure under pressure.',
      'Needs to slow the game down mentally in tight moments.',
    ],
    outcomeGoals: [
      'Become the player teammates look to when the game gets tense.',
      'Make noticeably fewer panicked decisions under pressure this season.',
    ],
    performanceGoals: [
      'Practice one extra touch before releasing the ball under pressure.',
      'Use a pre-game breathing routine to stay calm from kickoff.',
    ],
  },
  {
    id: 'leadership', label: 'Leadership', pillar: 'mental',
    strengths: [
      "Leads by example and lifts teammates' energy.",
      'Takes responsibility and helps organize the team on the field.',
    ],
    weaknesses: [
      'Leads quietly by play alone — could do more vocally.',
      "Needs to take more ownership when things aren't going well.",
    ],
    outcomeGoals: [
      "Become one of the team's clear on-field leaders by season's end.",
      'Help younger or newer teammates settle in through mentorship.',
    ],
    performanceGoals: [
      'Check in with a struggling teammate at least once every training.',
      'Practice giving one piece of specific, positive feedback to a teammate each session.',
    ],
  },
  {
    id: 'competitiveness', label: 'Competitiveness & Resilience', pillar: 'mental',
    strengths: [
      'Competes for every ball and hates losing even small battles.',
      'Bounces back quickly from mistakes without dropping the head.',
    ],
    weaknesses: [
      'Gets discouraged and disengages after a mistake.',
      'Needs to compete harder for 50/50 balls.',
    ],
    outcomeGoals: [
      'Become known as one of the toughest competitors on the team.',
      'Cut the time it takes to refocus after a mistake to seconds.',
    ],
    performanceGoals: [
      'Practice a quick reset routine — one breath, next play — after every mistake in training.',
      'Compete for every 50/50 ball in scrimmages, no exceptions.',
    ],
  },
  {
    id: 'coachability', label: 'Coachability & Response to Feedback', pillar: 'mental',
    strengths: [
      'Takes coaching well and applies it immediately in the next rep.',
      'Asks good questions and genuinely wants to improve.',
    ],
    weaknesses: [
      'Needs to apply feedback in the moment instead of repeating the same mistake.',
      'Can be defensive about corrections instead of taking them on board.',
    ],
    outcomeGoals: [
      'Become one of the most consistently improving players on the roster.',
      'Visibly apply at least one coaching point from every session into matches.',
    ],
    performanceGoals: [
      'Write down one coaching point after every practice and review it before the next.',
      'Ask one clarifying question per session to better understand feedback.',
    ],
  },
];
