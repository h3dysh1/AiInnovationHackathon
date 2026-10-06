# AiInnovationHackathon

`mo-app` is a React Native and Expo starter for the hackathon. It uses TypeScript and Expo Router.

## Run on your phone

1. Install Node.js 22.13 or newer and Expo Go on your phone.
2. In this folder, run `npm install` and then `npm start`.
3. Keep your computer and phone on the same Wi-Fi network, then scan the QR code shown in the terminal. On iPhone, use the Camera app; on Android, use Expo Go.

If your phone cannot reach the local development server, try `npx expo start --tunnel`. Your computer must keep running the development server while you use Expo Go.

## Build the app

- Edit `src/app/index.tsx` for the first screen.
- Add more screens as files in `src/app/`. Expo Router is already configured.
- Install Expo-compatible packages with `npx expo install <package>`.

Expo Go is for development and demos. It supports the native modules included in Expo Go. If your project needs another native library or an installable standalone app, create a development or production build later.
