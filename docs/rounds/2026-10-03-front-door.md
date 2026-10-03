# The front door (Oct 3 2026)

Branch `oct3/front-door`, on master's `295c0516`. AJ's brief: redesign the
welcome, sign-in and verification flow into "an exceptional front door to the
app" that uses the MAX logo and the brand's colours, accessible, quick for a
returning trainer, and not a generic sign-in template.

## How it was decided

1. **The review.** What the code did, before any drawing:
   - every returning trainer saw the Request Access form ("not registered as
     an authorized trainer") for a second or two after Google said yes, while
     Journey looked them up;
   - a trainer whose record couldn't be read (bad Wi-Fi) was shown that same
     form, as if they were a stranger;
   - a sent request was forgotten: every sign-in showed the empty form again;
   - the sign-in screen's labels were near-black on dark in light theme, its
     background pattern came from another website, and its footer shouted
     "MASTER/ADMIN CREDENTIALS REQUIRED";
   - Choose Your Studio said "Active territory" on every card, printed each
     name twice, and put Go to Operations above your own studios.
2. **The interview.** AJ, Oct 3 2026:
   - iPads change hands: "some studios have different models of ipads
     sometimes making the studio have a 'good ipad'... sometimes trainers pick
     up the wrong ipad... at the start of the day theres a slight chance it
     could be a different trainer getting on it." New hires are walked in by a
     leader, not sent in alone.
   - Someone with one studio gets **a greeting**, not a picker.
   - A studio card says today, your next session, and keeps the counts, plus
     "a mild amount of info relating to how many tasks there are or possibly
     client opportunities... just something that we can take advantage of the
     current data we already load".
3. **Three directions**, clickable through every state on iPad portrait,
   landscape and phone (the git-ignored `harness/front-door.html`): A, the
   three squares; B, the climb; C, quiet studio. AJ: **"three squares (a) is
   just so good"**.
4. **Three answers while it was built.** "Clients do not use the app at this
   time." "Leaders can just go through the same as trainers because honestly
   they will probably want to look at the daily schedule." A new hire waiting
   for access gets no Demo Mode: the rules let only someone with a trainer
   record into it, and giving them one would change how approval writes the
   new trainer, so AJ: "we will have to make the new hires wait".

## What was built

Three commits, each typechecked on its own (2 errors, the baseline).

1. **Checking you in, Can't check, and the sign-in screen.**
   `useAuthInitialization` says where the lookup is (`trainerLookup`:
   checking, done, failed; `lookupStep`; `retryLookup`). AppContent shows
   Checking you in (three named steps, each lighting one square), Can't check
   ("That's the connection, not your account", Try again), and the request
   form only after a finished lookup that found nobody. The sign-in screen:
   the squares assemble, one line says what Journey is, Microsoft says it is
   for @maxstrengthfitness.com, errors are sentences under the buttons
   (`sign-in-errors.ts`), and the foot says which studio the iPad opens (its
   name kept across sign-out, `DEVICE_STUDIO_KEY`). The loading screen before
   Firebase answers is the squares too.
2. **Not on a team yet, remembered.** Three questions, two of them taps; no
   client role. The request is kept at `access_requests/{uid}` and read back
   by that id, so the next sign-in shows the waiting page: who has it, what
   happens next, Check again.
3. **The greeting, the picker, the door.** After a sign-in the iPad's studio
   (else home, else your only one) greets the person rather than opening by
   itself: name, today there (your next client, the studio's sessions, open
   team jobs), one orange Start. Other studios are buttons underneath;
   Demo Mode a link at the foot; no Operations door (leaders switch from the Hub). "Not you? Sign out" at the top
   of every screen after sign-in. The picker ("Where are you today?") is for
   no studio to greet with, All my studios, and Change studio. Going in, the
   M and X part and the A opens like a door.

## What it costs

The greeting makes two reads for the one studio it greets with, once per
sign-in: the day's bookings there (the Hub's own query shape and index) and a
count of open team jobs (one read). The picker reads the counts it read
before. The waiting page reads one document. No new index, no rules change,
no Mindbody call.

## Behaviour that changed

- **A pinned iPad no longer opens its studio by itself after a sign-in**: it
  greets the person with it, one tap in. A reload with a studio already open
  still goes straight back to it.
- A request sent before this round sits under a random id, so that person sees
  the form once more, and the leaders may see two requests from them.

## Not done

- **Client opportunities on the greeting** (birthdays, anniversaries): the
  client list isn't loaded before a studio is chosen, so they would be a new
  read. Left for AJ to ask for.
- **Demo Mode while waiting**: see above.
- **Changing a request's studio** from the waiting page: the rules let only a
  leader change a request, so it says "tell a leader at the one you meant".

## Found on the way

`firestore.rules`, `trainers` create: the bootstrap clause lets any signed-in
account create `trainers/{its own uid}` naming any studio and any role short
of Admin, Founder or Overseer. The app never does, but a crafted request
could join a studio without a leader's approval. Raised with AJ, not changed
here.

## Ship

Nothing to deploy but the push. Tests: see the counts in CLAUDE.md.
