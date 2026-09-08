# Usage limits and price estimates

This page explains where Agent Nekko's usage numbers come from and what they mean.

## Where the limit numbers come from

The app does not guess your usage. It asks the provider:

- **Claude (Anthropic subscription)** — Every subscription-mode response carries `anthropic-ratelimit-unified-*` headers that report the 5-hour, 7-day, and per-model 7-day windows. The host also polls `GET https://api.anthropic.com/api/oauth/usage` for the first paint and manual refreshes.

- **ChatGPT (Codex subscription)** — The host polls `GET https://chatgpt.com/backend-api/wham/usage` with the current Bearer token and `ChatGPT-Account-Id`. The `/wham/usage` endpoint returns the rolling 5-hour (`primary_window`) and 7-day (`secondary_window`) usage, plus plan type and credits.

Both providers are normalized into the same `SubscriptionLimits` shape in `packages/shared/src/limits.ts`.

## Live reads, not estimates

The numbers in the chat header chip and the Models card are live reads from the provider. They update after each subscription response and on a throttled poll. Agent Nekko does not extrapolate or predict your usage locally; if a provider does not return a window, that window is simply not shown.

## Off-label caveat

The Anthropic and ChatGPT usage endpoints used here are documented by or reverse-engineered from the providers' subscription flows. They can change, move, or stop returning data at any time. Agent Nekko is not affiliated with Anthropic or OpenAI, and the readouts are provided as a convenience for subscribers, not as an official feature of those services.

## Prices are list estimates, not a bill

`MODEL_PRICING` in `packages/shared/src/limits.ts` is a table of published list prices, matched by model id substring. The per-model labels (`$X/$Y per MTok`) and the session total in the chat header are estimates only.

Your actual provider bill may differ because of taxes, discounts, cached-token pricing, batch pricing, enterprise agreements, image or tool-token costs, or mid-rate changes. Local models (Ollama, LM Studio, vLLM) and subscription providers are shown as `Free` or `Included in plan` because they are not metered through an API key in Agent Nekko.

## Limits are provider-side

Agent Nekko can only read and surface the limits that Anthropic and OpenAI return. It cannot raise, reset, or bypass them. If a window is reported as rate limited, that state comes from the provider; Agent Nekko does not create or remove the limit.
