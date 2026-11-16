> This is an unpublished draft. Open **Owner login → Notes** to finish it, then switch on "Published".

## The symptom

Throughput flattened at about 32 LLM calls a minute. Only a handful of notices could run in parallel, and each slowed sharply past that point.

## The obvious suspect

The GPU. _Write what made it look guilty._

## What I measured

A capacity study against the live serving metrics, from N = 1 to N = 40: per-call token cost and latency at each level of concurrency.

_Add the chart or the table here._

## What the data said

The bottleneck was a gateway concurrency cap, not the GPU.

## The fix, and the number

Lifting the cap took throughput from 32 to 56 calls a minute, with only a mild rise in latency.

## What I'd tell someone else

_One paragraph: the general lesson._
