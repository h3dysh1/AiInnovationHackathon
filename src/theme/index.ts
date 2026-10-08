// Ground Control's daylight operations palette. One visual source of truth.
export const colors = {
  brand: '#B8462D', canvas: '#FAF9F6', surface: '#FFFFFF', text: '#20201E', secondary: '#686760',
  accent: '#20201E', accentSoft: '#EEECE5', border: '#E4E1D9', fieldBorder: '#AAA79E',
  control: '#F0EEE8', field: '#FFFFFF', placeholder: '#706D64', onAccent: '#FFFFFF',
  success: '#246044', successSoft: '#EDF7F0', warning: '#77520C', warningSoft: '#FFF7E6',
  error: '#A52D3A', errorSoft: '#FFF0F1',
} as const;
export const fonts = { regular: 'DMSansRegular', medium: 'DMSansMedium', semibold: 'DMSansSemiBold' } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { control: 4, surface: 0 } as const;
