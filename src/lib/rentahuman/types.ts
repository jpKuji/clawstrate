export type RentAHumanCurrency = "USD" | "EUR" | "ETH" | "BTC" | "USDC" | string;

export interface RentAHumanLocation {
  city?: string;
  state?: string;
  country?: string;
  isRemoteAllowed?: boolean;
  isRemoteAvailable?: boolean;
  serviceRadius?: number;
}

export interface RentAHumanBounty {
  id: string;
  agentId?: string;
  agentName?: string;
  agentType?: string;
  title?: string;
  description?: string;
  requirements?: string[];
  skillsNeeded?: string[];
  category?: string;
  location?: RentAHumanLocation;
  estimatedHours?: number;
  priceType?: "fixed" | "hourly" | string;
  price?: number;
  currency?: RentAHumanCurrency;
  status?: string;
  likeCount?: number;
  upvoteCount?: number;
  downvoteCount?: number;
  verifiedUpvoteCount?: number;
  verifiedDownvoteCount?: number;
  applicationCount?: number;
  spotsAvailable?: number;
  spotsFilled?: number;
  assignedHumanIds?: string[];
  bookingIds?: string[];
  createdAt?: string;
  updatedAt?: string;
  deadline?: string;
  [key: string]: unknown;
}

export interface RentAHumanHuman {
  id: string;
  name?: string;
  headline?: string;
  gender?: string | null;
  bio?: string;
  avatarUrl?: string;
  photoUrls?: string[];
  skills?: string[];
  expertise?: string[];
  location?: RentAHumanLocation;
  languages?: string[];
  hourlyRate?: number;
  currency?: RentAHumanCurrency;
  acceptsCrypto?: boolean;
  availability?: Record<string, unknown>;
  timezone?: string;
  totalBookings?: number;
  rating?: number;
  reviewCount?: number;
  profileViews?: number;
  isAvailable?: boolean;
  isVerified?: boolean;
  isProfileComplete?: boolean;
  isFeatured?: boolean;
  createdAt?: unknown;
  [key: string]: unknown;
}

export interface RentAHumanListBountiesResponse {
  success: boolean;
  bounties: RentAHumanBounty[];
  count?: number;
  hasMore?: boolean;
  nextCursor?: string;
  [key: string]: unknown;
}

export interface RentAHumanGetBountyResponse {
  success: boolean;
  bounty: RentAHumanBounty;
  [key: string]: unknown;
}

export interface RentAHumanGetHumanResponse {
  success: boolean;
  human: RentAHumanHuman;
  [key: string]: unknown;
}
