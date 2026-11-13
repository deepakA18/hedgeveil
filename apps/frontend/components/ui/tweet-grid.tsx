"use client";

import * as React from "react";
import { EmbeddedTweet, TweetSkeleton, useTweet } from "react-tweet";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const tweetGridVariants = cva("max-w-4xl px-2 md:max-w-6xl", {
  variants: {
    columns: {
      1: "columns-1",
      2: "sm:columns-2",
      3: "md:columns-3",
      4: "lg:columns-4",
      5: "xl:columns-5",
    },
  },
  defaultVariants: {
    columns: 3,
  },
});

const tweetItemVariants = cva("break-inside-avoid", {
  variants: {
    spacing: {
      sm: "mb-2",
      md: "mb-4",
      lg: "mb-6",
    },
  },
  defaultVariants: {
    spacing: "md",
  },
});

export interface TweetGridProps
  extends
    VariantProps<typeof tweetGridVariants>,
    VariantProps<typeof tweetItemVariants> {
  tweets: string[];
  className?: string;
}

// Actual syndication data, fetched by our fixed-post server endpoint.
function TweetPreview({ id }: { id: string }) {
  const { data, isLoading } = useTweet(id, `/api/tweet/${id}`);
  if (isLoading)
    return (
      <div role="status" aria-label="Loading post">
        <TweetSkeleton />
      </div>
    );
  if (!data)
    return (
      <div className="tweet-unavailable">
        <strong>Vitalik Buterin</strong>
        <p>The post preview is unavailable right now.</p>
        <a
          href={`https://x.com/VitalikButerin/status/${id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Read the original post
        </a>
      </div>
    );
  return <EmbeddedTweet tweet={data} />;
}

export const TweetGrid: React.FC<TweetGridProps> = ({
  tweets,
  columns,
  spacing,
  className,
}) => {
  return (
    <div
      className={cn("tweet-grid", tweetGridVariants({ columns }), className)}
      data-columns={columns ?? 3}
    >
      {tweets.map((tweetId, i) => (
        <div
          key={`${tweetId}-${i}`}
          className={cn(tweetItemVariants({ spacing }))}
        >
          <TweetPreview id={tweetId} />
        </div>
      ))}
    </div>
  );
};
