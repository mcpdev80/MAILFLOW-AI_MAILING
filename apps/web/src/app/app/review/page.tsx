"use client";

import { ReviewUi } from "./review-ui";
import { useReviewPage } from "./use-review-page";

export default function ReviewPage() {
  const review = useReviewPage();

  return (
    <ReviewUi
      data={review.data}
      error={review.error}
      busy={review.busy}
      isEmpty={review.isEmpty}
      onApply={review.apply}
      onRetry={review.retry}
      onReload={review.reload}
    />
  );
}
