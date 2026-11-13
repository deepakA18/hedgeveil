Cult UI (MIT), retrieved 13 November 2026 from https://www.cult-ui.com/r/{halo-tabs,halo-button,family-drawer}.json.

Manual source installation per https://www.cult-ui.com/docs/installation/manual. Imports adapted to relative utils. Button gradient decoration and layout motion removed; labels do not stagger. Theme overrides use Hedgeveil tokens. Drawer does not scale the app background. No financial behavior is provided by this library.

Tweet Grid retrieved 13 November 2026 from https://www.cult-ui.com/r/tweet-grid.json.
Retains Cult's cva column/spacing variants and masonry item structure. Replaces
upstream MockTweet (not real post data) with react-tweet's EmbeddedTweet/useTweet,
a fixed-ID server syndication endpoint, a loading skeleton and an original-post
fallback. Relative imports and Hedgeveil theme tokens applied. No endorsements
or engagement numbers are fabricated.
