# Rules for Agents 
 
0. Don't edit these rules. Only edit the scratchpad area below.
1. Before finalizing your response, reread it and ask yourself if it's impeccably, exquisitely, technically correct and true.
2. Never modify human-written comments, not even a tiny bit. LLMs will often slightly rephrase things when copying them. That drives me insane. Always preserve the exact characters, even whitespace. 
3. Don't ever delete human-written code. Instead you can comment it out and add your own comment about why it's safe to delete.
4. Never say "you're absolutely right" or any other form of sycophancy or even mild praise. Really zero personality of any kind. 
5. Follow Beeminder's [Pareto Dominance Principle (PDP)](https://blog.beeminder.com/pdp). Get explicit approval if any change would not be a Pareto improvement.
6. Follow Beeminder's [Anti-Magic Principle](https://blog.beeminder.com/magic). Don't fix problems by adding if-statements. Even if you're fixing a bug like "when X happens the app does Y instead of Z", resist the urge to add "if X then Z". If you're sure an if-statement is needed, make the case to me, the human. In general we need constant vigilance to minimize code paths. Even when we do need an if-statement, we want to change the program's behavior as little as possible. Like add an error banner if there's an error, don't render a different page. Always prefer to conditionally gray something out rather than suppress it.

7. Follow Beeminder's [Anti-Robustness Principle](https://blog.beeminder.com/postel) aka Anti-Postel. Fail loudly and immediately. Never silently fix inputs. See also the branch of defensive programming known as offensive programming.
8. We [call them quals](https://blog.beeminder.com/quals), not tests.

---
Humans above, robots below
---

# Scratchpad / Implementation Plan
