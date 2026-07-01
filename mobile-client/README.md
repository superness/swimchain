# Tidal - Swimchain Mobile Client

A novel social media experience where attention has weight.

## Quick Start

### Prerequisites

1. **Node.js 18+** - [Download](https://nodejs.org/)
2. **pnpm** (recommended) or yarn - `npm install -g pnpm`
3. **For Android**: Android Studio with SDK 33+
4. **For iOS**: Xcode 15+ (macOS only)
5. **A running Swimchain node** (see below)

### Step 1: Start a Swimchain Node

The mobile app needs a node to connect to. In a separate terminal:

```bash
# From the swimchain root directory
cargo run -- node start --rpc-port 3030
```

Or if you have a pre-built binary:
```bash
swimchain node start --rpc-port 3030
```

### Step 2: Install Dependencies

```bash
cd mobile-client

# Option A: Using pnpm (handles workspace deps)
pnpm install

# Option B: If workspace deps fail, modify package.json first:
# Change "@swimchain/core": "workspace:*" to "@swimchain/core": "file:../swimchain-js"
# Change "@swimchain/react": "workspace:*" to "@swimchain/react": "file:../swimchain-react"
# Then run: npm install
```

### Step 3: Run the App

**For Android (Emulator or Device):**

```bash
# Start Metro bundler
npm start

# In another terminal, run on Android
npm run android
```

**For iOS (macOS only):**

```bash
# Install CocoaPods dependencies first
cd ios && pod install && cd ..

# Start Metro bundler
npm start

# In another terminal, run on iOS
npm run ios
```

---

## Development Setup (Detailed)

### Android Setup

1. **Install Android Studio**: https://developer.android.com/studio

2. **Install SDK**: Open Android Studio → Settings → SDK Manager
   - SDK Platforms: Android 14 (API 34)
   - SDK Tools: Android SDK Build-Tools 34, Android Emulator, Android SDK Platform-Tools

3. **Create Emulator**: Tools → Device Manager → Create Device
   - Recommended: Pixel 6 with API 34

4. **Set Environment Variables** (add to `~/.bashrc` or `~/.zshrc`):
   ```bash
   export ANDROID_HOME=$HOME/Android/Sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```

5. **Start Emulator**:
   ```bash
   emulator -avd Pixel_6_API_34
   ```

### iOS Setup (macOS only)

1. **Install Xcode** from App Store

2. **Install Command Line Tools**:
   ```bash
   xcode-select --install
   ```

3. **Install CocoaPods**:
   ```bash
   sudo gem install cocoapods
   ```

4. **Install iOS Dependencies**:
   ```bash
   cd mobile-client/ios
   pod install
   cd ..
   ```

### Connecting to Local Node

The app connects to a local Swimchain node by default:

- **Android Emulator**: `10.0.2.2:3030` (special IP for host machine)
- **iOS Simulator**: `localhost:3030`
- **Physical Device**: Your machine's local IP (e.g., `192.168.1.100:3030`)

To change the node URL, edit `src/services/SwimchainRpc.ts`:

```typescript
export const DEFAULT_CONFIG: RpcConfig = {
  host: '10.0.2.2',  // Change this
  port: 3030,
  protocol: 'http',
};
```

---

## Running on Physical Device

### Android

1. Enable Developer Options on your phone
2. Enable USB Debugging
3. Connect via USB
4. Run: `npm run android`

### iOS

1. Open `ios/SwimchainMobile.xcworkspace` in Xcode
2. Select your device as the target
3. Click Run (or `Cmd+R`)

---

## Troubleshooting

### "Metro bundler not found"
```bash
npm start --reset-cache
```

### "Could not connect to development server"
- Make sure Metro bundler is running (`npm start`)
- For Android emulator, run: `adb reverse tcp:8081 tcp:8081`

### "SDK location not found"
Create `android/local.properties`:
```
sdk.dir=/path/to/Android/Sdk
```

### "Pod install fails"
```bash
cd ios
pod deintegrate
pod install
```

### "Workspace dependency error"
The package uses workspace protocol. Either:
1. Use pnpm: `pnpm install`
2. Or modify package.json to use file paths instead of `workspace:*`

### "Cannot connect to Swimchain node"
1. Make sure node is running: `cargo run -- node start --rpc-port 3030`
2. Check the IP address in `SwimchainRpc.ts`
3. For physical devices, ensure your phone is on the same network

---

## Project Structure

```
mobile-client/
├── App.tsx                 # Main app entry
├── src/
│   ├── components/         # UI components
│   │   └── tidal/          # Tidal UX components (new)
│   ├── hooks/              # React hooks
│   │   ├── useRpc.ts       # RPC data hooks
│   │   ├── useMobilePow.ts # PoW mining hook
│   │   └── useKeypair.ts   # Identity management
│   ├── screens/            # Screen components
│   ├── services/           # Backend services
│   │   └── SwimchainRpc.ts # Node RPC client
│   ├── navigation/         # React Navigation setup
│   ├── native/             # Native module bridges
│   └── theme/              # Colors, typography, spacing
├── android/                # Android native code
├── ios/                    # iOS native code
└── docs/                   # Documentation
    ├── TIDAL_VISION.md     # Product vision
    ├── TIDAL_UX_DESIGN.md  # UX design system
    └── TIDAL_FEATURE_SPEC.md # Feature specifications
```

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start Metro bundler |
| `npm run android` | Run on Android |
| `npm run ios` | Run on iOS |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript check |
| `npm test` | Run tests |

---

## Tech Stack

- **React Native 0.73** - Cross-platform mobile framework
- **TypeScript** - Type safety
- **React Navigation** - Navigation
- **Reanimated 3** - Animations (breath indicators, etc.)
- **Gesture Handler** - Touch interactions (tend gesture)
- **AsyncStorage** - Local persistence

---

## Documentation

- [Vision Document](docs/TIDAL_VISION.md) - Why Tidal exists
- [UX Design](docs/TIDAL_UX_DESIGN.md) - The Tidal design system
- [Feature Specs](docs/TIDAL_FEATURE_SPEC.md) - Detailed feature specifications

---

## Need Help?

1. Check the troubleshooting section above
2. Ensure your Swimchain node is running
3. For React Native issues, see: https://reactnative.dev/docs/troubleshooting
