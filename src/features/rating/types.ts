export type Rating = {
  id: string;
  bookingId: string;
  userId: string;
  parkingLotId: string;
  score: number;
  comment: string | null;
  createdAt: string;
};

export type RatingWithAuthor = Rating & { authorName: string };
