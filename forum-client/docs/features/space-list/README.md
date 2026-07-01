# Space List

Browse and follow public discussion spaces on the Swimchain network.

## Overview

The Space List page displays all available public spaces on the network. Users can browse existing spaces, view their activity stats, and create new spaces if they have a sponsored identity.

## Access

**Route:** `/spaces`

This is the default landing page after login. Users are automatically redirected here from the root route (`/`).

## Key UI Elements

### Page Header

- **Title:** "Spaces"
- **Description:** Brief guidance text explaining the page purpose
- **Create Space Button:** Appears for sponsored users to create new spaces

### Space Cards

Each space is displayed as a clickable card containing:

| Element | Description |
|---------|-------------|
| **Icon** | Hexagonal icon representing the space |
| **Name** | The space's display name |
| **Description** | Brief description of the space topic |
| **Active Posts** | Number of posts with recent engagement |
| **Total Posts** | Total number of posts in the space |

Clicking a space card navigates to `/spaces/:spaceId` to view the space's threads.

### Create Space Form

When the "+ Create Space" button is clicked, an inline form appears with:

- **Space Name Input:** Text field for entering the new space name
- **PoW Mining Progress:** Progress indicator during proof-of-work computation
- **Create/Cancel Buttons:** Form submission and cancellation controls

Creating a space requires:
1. A valid identity (stored or node-based)
2. Sponsorship status (identity must be sponsored by an existing member)
3. Proof-of-work computation to prevent spam

### Getting Started Section

For users without an identity, a "Getting Started" card appears explaining:
- How Swimchain works (content decay, engagement-based persistence)
- Steps to participate (browse, create identity, engage, post)
- Link to create an identity

### Error States

- **Loading:** "Loading spaces..." indicator during data fetch
- **Error:** Error message with "Try Again" button and optional "Set Up Identity" link
- **Empty:** "No Spaces Yet" message when no spaces are discovered

## User Flows

### Browse Spaces

1. Navigate to `/spaces`
2. View the grid of available spaces
3. Click a space card to view its threads

### Create a Space (Sponsored Users)

1. Click "+ Create Space" button
2. Enter a space name in the form
3. Click "Create Space" to begin PoW mining
4. Wait for mining to complete
5. Space is created and user is redirected to the new space

### New User Onboarding

1. View the "Getting Started" section
2. Click "Create Your Identity" to set up an identity
3. Return to browse and participate in spaces

## Technical Details

- **Component:** `SpaceList.tsx`
- **Styles:** `SpaceList.css`
- **Data Hook:** `useSpaces()` from `useRpc`
- **PoW Hook:** `useSpaceCreationPow()` from `useActionPow`

## Screenshots

No screenshots have been captured for this feature yet.

## Related Pages

- [Space View](/spaces/:spaceId) - View threads within a space
- [New Thread](/spaces/:spaceId/new) - Create a new thread in a space
- [Identity](/identity) - Manage user identity
