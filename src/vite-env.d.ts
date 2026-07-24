/// <reference types="vite/client" />

declare module 'chinese-lunar-calendar' {
  export function getLunar(
    year: number,
    month: number,
    date: number,
  ): {
    lunarMonth: number
    lunarDate: number
    isLeap: boolean
    solarTerm: string | null
    lunarYear: string
    zodiac: string
    dateStr: string
  }
}
