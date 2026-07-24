export type HolidayType = 'holiday' | 'workday'

export type ChinaHoliday = {
  date: string
  name: string
  type: HolidayType
}

const chinaHolidays: ChinaHoliday[] = [
  { date: '2026-01-01', name: '元旦', type: 'holiday' },
  { date: '2026-01-02', name: '元旦', type: 'holiday' },
  { date: '2026-01-03', name: '元旦', type: 'holiday' },
  { date: '2026-01-04', name: '调休上班', type: 'workday' },

  { date: '2026-02-14', name: '调休上班', type: 'workday' },
  { date: '2026-02-15', name: '春节', type: 'holiday' },
  { date: '2026-02-16', name: '春节', type: 'holiday' },
  { date: '2026-02-17', name: '春节', type: 'holiday' },
  { date: '2026-02-18', name: '春节', type: 'holiday' },
  { date: '2026-02-19', name: '春节', type: 'holiday' },
  { date: '2026-02-20', name: '春节', type: 'holiday' },
  { date: '2026-02-21', name: '春节', type: 'holiday' },
  { date: '2026-02-22', name: '春节', type: 'holiday' },
  { date: '2026-02-23', name: '春节', type: 'holiday' },
  { date: '2026-02-28', name: '调休上班', type: 'workday' },

  { date: '2026-04-04', name: '清明节', type: 'holiday' },
  { date: '2026-04-05', name: '清明节', type: 'holiday' },
  { date: '2026-04-06', name: '清明节', type: 'holiday' },

  { date: '2026-05-01', name: '劳动节', type: 'holiday' },
  { date: '2026-05-02', name: '劳动节', type: 'holiday' },
  { date: '2026-05-03', name: '劳动节', type: 'holiday' },
  { date: '2026-05-04', name: '劳动节', type: 'holiday' },
  { date: '2026-05-05', name: '劳动节', type: 'holiday' },
  { date: '2026-05-09', name: '调休上班', type: 'workday' },

  { date: '2026-06-19', name: '端午节', type: 'holiday' },
  { date: '2026-06-20', name: '端午节', type: 'holiday' },
  { date: '2026-06-21', name: '端午节', type: 'holiday' },

  { date: '2026-09-20', name: '调休上班', type: 'workday' },
  { date: '2026-09-25', name: '中秋节', type: 'holiday' },
  { date: '2026-09-26', name: '中秋节', type: 'holiday' },
  { date: '2026-09-27', name: '中秋节', type: 'holiday' },

  { date: '2026-10-01', name: '国庆节', type: 'holiday' },
  { date: '2026-10-02', name: '国庆节', type: 'holiday' },
  { date: '2026-10-03', name: '国庆节', type: 'holiday' },
  { date: '2026-10-04', name: '国庆节', type: 'holiday' },
  { date: '2026-10-05', name: '国庆节', type: 'holiday' },
  { date: '2026-10-06', name: '国庆节', type: 'holiday' },
  { date: '2026-10-07', name: '国庆节', type: 'holiday' },
  { date: '2026-10-10', name: '调休上班', type: 'workday' },
]

export const chinaHolidayMap = new Map(chinaHolidays.map((holiday) => [holiday.date, holiday]))
