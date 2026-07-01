# Sponsorship System

**Feature Group**: Sponsorship System
**Route**: `/sponsorship`

## Overview

The Sponsorship System enables existing network members to vouch for new users, creating a web of trust that controls access to content creation. New users must be sponsored before they can post content.

## UI Components

### Sponsorship Page

The sponsorship page has three tabs:

#### 1. Get Sponsored Tab

![Get Sponsored](01-sponsorship-page.png)

For new users seeking sponsorship:
- **How Sponsorship Works**: Step-by-step explanation
- **Your Public Key**: Share this with potential sponsors
- **Open Offers**: Browse available sponsorship offers to claim
- **Copy Button**: Easy sharing of public key

#### 2. Sponsor Others Tab

![Sponsor Others](02-sponsor-others-tab.png)

For existing members who want to sponsor newcomers:
- **Create Offer**: Make your sponsorship offer visible
- **Offer List**: View and manage your active offers
- **Review Applications**: Approve or reject sponsorship requests

#### 3. My Status Tab

![My Status](03-my-status-tab.png)

View your current sponsorship status:
- **Status**: Active (green) or Pending (yellow)
- **Depth**: Your position in the sponsorship tree (0 = root/genesis)
- **Sponsor Info**: Who sponsored you (if applicable)
- **Sponsees**: Users you have sponsored

## Sponsorship Flow

1. **New User** shares their public key or browses open offers
2. **Sponsor** creates an offer or receives a direct request
3. **Sponsor** approves the sponsorship
4. **System** records the sponsorship on-chain
5. **New User** can now create content

## Technical Details

- Sponsorship creates a tree structure with genesis identities at root (depth 0)
- Each sponsorship increases depth by 1
- Sponsors can set limits on how many users they sponsor
- Sponsorship status is recorded on-chain and verified by nodes

## Related Features

- Sponsorship Offers (create/claim offers)
- Direct Sponsorship (sponsor by public key)
- Sponsorship Status Badge (shown in header when sponsored)
