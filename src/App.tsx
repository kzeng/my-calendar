import { useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import multiMonthPlugin from '@fullcalendar/multimonth'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg } from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { getLunar } from 'chinese-lunar-calendar'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import {
  Bell,
  CalendarDays,
  Check,
  Download,
  Eye,
  ListChecks,
  Monitor,
  Moon,
  Plus,
  Save,
  Search,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { chinaHolidayMap } from './holidays'
import './App.css'

type Priority = 'low' | 'normal' | 'high'

type CalendarEvent = {
  id?: number
  title: string
  startsAt: string
  endsAt: string
  allDay: boolean
  body: string
  tags: string[]
  location: string
  priority: Priority
  remindAt?: string | null
  completed: boolean
  notifiedAt?: string | null
}

type ViewMode = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'multiMonthYear'
type ThemeMode = 'light' | 'dark' | 'system'

type LunarInfo = {
  dateStr: string
  solarTerm: string | null
}

const emptyEvent = (): CalendarEvent => {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  const end = new Date(start)
  end.setHours(start.getHours() + 1)

  return {
    title: '',
    startsAt: toInputValue(start),
    endsAt: toInputValue(end),
    allDay: false,
    body: '',
    tags: [],
    location: '',
    priority: 'normal',
    remindAt: null,
    completed: false,
  }
}

function toInputValue(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return offsetDate.toISOString().slice(0, 16)
}

function todayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start)
  end.setDate(start.getDate() + 1)
  return { start: toInputValue(start), end: toInputValue(end) }
}

function formatDateTime(value: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getLunarLabel(date: Date) {
  const lunar = getLunar(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  ) as LunarInfo
  return lunar.solarTerm ?? lunar.dateStr
}

function toDateKey(date: Date) {
  return toInputValue(date).slice(0, 10)
}

function fromInputValue(value?: string | null) {
  return value ? new Date(value) : null
}

function App() {
  const calendarRef = useRef<FullCalendar>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [activeEvent, setActiveEvent] = useState<CalendarEvent>(emptyEvent)
  const [editorOpen, setEditorOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('dayGridMonth')
  const [preview, setPreview] = useState(true)
  const [message, setMessage] = useState('本地日历已就绪')
  const [searchDraft, setSearchDraft] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [reminderAlerts, setReminderAlerts] = useState<CalendarEvent[]>([])
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = window.localStorage.getItem('my-calendar-theme')
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
  })

  const filteredEvents = useMemo(() => {
    const keyword = appliedSearch.trim().toLowerCase()
    if (!keyword) return events
    return events.filter((event) => {
      return [
        event.title,
        event.body,
        event.location,
        event.priority,
        ...event.tags,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
  }, [events, appliedSearch])

  const todayEvents = useMemo(() => {
    const { start, end } = todayRange()
    return events
      .filter((event) => event.startsAt >= start && event.startsAt < end)
      .slice(0, 8)
  }, [events])

  const frequentLocations = useMemo(() => {
    const counts = new Map<string, number>()
    for (const event of events) {
      const location = event.location.trim()
      if (location) counts.set(location, (counts.get(location) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .slice(0, 8)
      .map(([value]) => value)
  }, [events])

  const frequentTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const event of events) {
      for (const tag of event.tags) {
        const normalizedTag = tag.trim()
        if (normalizedTag) counts.set(normalizedTag, (counts.get(normalizedTag) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .slice(0, 10)
      .map(([value]) => value)
  }, [events])

  async function loadEvents() {
    const result = await invoke<CalendarEvent[]>('list_events')
    setEvents(result)
  }

  async function checkReminders() {
    const now = toInputValue(new Date())
    const due = await invoke<CalendarEvent[]>('due_reminders', { now })
    if (due.length === 0) return

    setReminderAlerts((current) => {
      const existingIds = new Set(current.map((event) => event.id))
      return [...current, ...due.filter((event) => !existingIds.has(event.id))]
    })

    let granted = await isPermissionGranted()
    if (!granted) {
      granted = (await requestPermission()) === 'granted'
    }

    for (const event of due) {
      if (granted) {
        try {
          sendNotification({
            title: event.title,
            body: `${formatDateTime(event.startsAt)} ${event.location}`.trim(),
          })
        } catch {
          setMessage('系统通知发送失败，已显示应用内提醒')
        }
      }
      await invoke('mark_notified', {
        id: event.id,
        notifiedAt: now,
      })
    }
    await loadEvents()
  }

  useEffect(() => {
    loadEvents().catch((error) => setMessage(String(error)))
    checkReminders().catch((error) => setMessage(`提醒检查失败：${String(error)}`))
  }, [])

  useEffect(() => {
    calendarRef.current?.getApi().changeView(viewMode)
  }, [viewMode])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    function applyTheme() {
      const resolvedTheme = themeMode === 'system' ? (media.matches ? 'dark' : 'light') : themeMode
      document.documentElement.dataset.theme = resolvedTheme
      document.documentElement.dataset.themeMode = themeMode
      document.documentElement.style.colorScheme = resolvedTheme
      window.localStorage.setItem('my-calendar-theme', themeMode)
    }

    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [themeMode])

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        await checkReminders()
      } catch (error) {
        setMessage(`提醒检查失败：${String(error)}`)
      }
    }, 30_000)

    return () => window.clearInterval(interval)
  }, [])

  async function saveActiveEvent() {
    try {
      const saved = await invoke<CalendarEvent>('save_event', {
        event: activeEvent,
      })
      setActiveEvent(saved)
      setEditorOpen(false)
      await loadEvents()
      await checkReminders()
      setMessage('日程已保存')
    } catch (error) {
      setMessage(String(error))
    }
  }

  async function deleteActiveEvent() {
    if (!activeEvent.id) {
      setActiveEvent(emptyEvent())
      return
    }
    try {
      await invoke('delete_event', { id: activeEvent.id })
      setActiveEvent(emptyEvent())
      setEditorOpen(false)
      await loadEvents()
      setMessage('日程已删除')
    } catch (error) {
      setMessage(String(error))
    }
  }

  async function exportJson() {
    try {
      const path = await save({
        title: '导出日程 JSON',
        defaultPath: `my-calendar-events-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [
          {
            name: 'JSON',
            extensions: ['json'],
          },
        ],
      })
      if (!path) {
        setMessage('已取消导出')
        return
      }
      await invoke<string>('export_events_json_to', { path })
      setMessage(`已导出：${path}`)
    } catch (error) {
      try {
        const payload = JSON.stringify(events, null, 2)
        const blob = new Blob([payload], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `my-calendar-events-${new Date().toISOString().slice(0, 10)}.json`
        link.click()
        URL.revokeObjectURL(url)
        setMessage('已导出 JSON 文件')
      } catch {
        setMessage(`导出失败：${String(error)}`)
      }
    }
  }

  async function importJson() {
    try {
      const path = await open({
        title: '导入日程 JSON',
        multiple: false,
        filters: [
          {
            name: 'JSON',
            extensions: ['json'],
          },
        ],
      })
      if (!path || Array.isArray(path)) {
        setMessage('已取消导入')
        return
      }
      const count = await invoke<number>('import_events_json_from', { path })
      await loadEvents()
      setMessage(`已导入 ${count} 条日程`)
    } catch {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json,.json'
      input.onchange = async () => {
        try {
          const file = input.files?.[0]
          if (!file) {
            setMessage('已取消导入')
            return
          }
          const importedEvents = JSON.parse(await file.text()) as CalendarEvent[]
          if (!Array.isArray(importedEvents)) {
            throw new Error('JSON 必须是日程数组')
          }
          for (const event of importedEvents) {
            await invoke<CalendarEvent>('save_event', { event: { ...event, id: undefined } })
          }
          await loadEvents()
          setMessage(`已导入 ${importedEvents.length} 条日程`)
        } catch (browserError) {
          setMessage(`导入失败：${String(browserError)}`)
        }
      }
      input.click()
    }
  }

  function createForDate(dateInfo: DateClickArg) {
    const start = new Date(dateInfo.date)
    const end = new Date(start)
    end.setHours(start.getHours() + 1)
    setActiveEvent({
      ...emptyEvent(),
      startsAt: toInputValue(start),
      endsAt: toInputValue(end),
      allDay: dateInfo.allDay,
    })
    setEditorOpen(true)
  }

  function selectEvent(clickInfo: EventClickArg) {
    const id = Number(clickInfo.event.id)
    const event = events.find((item) => item.id === id)
    if (event) {
      setActiveEvent(event)
      setEditorOpen(true)
    }
  }

  function updateDraft(changes: Partial<CalendarEvent>) {
    setActiveEvent((event) => ({ ...event, ...changes }))
  }

  function updateDateRange(range: [Date | null, Date | null]) {
    const [start, end] = range
    updateDraft({
      startsAt: start ? toInputValue(start) : activeEvent.startsAt,
      endsAt: end ? toInputValue(end) : activeEvent.endsAt,
    })
  }

  function openEvent(event: CalendarEvent) {
    setActiveEvent(event)
    setEditorOpen(true)
  }

  function focusEvent(event: CalendarEvent) {
    calendarRef.current?.getApi().gotoDate(event.startsAt)
    openEvent(event)
  }

  function applySearch() {
    setAppliedSearch(searchDraft)
  }

  function addTag(tag: string) {
    if (activeEvent.tags.includes(tag)) return
    updateDraft({ tags: [...activeEvent.tags, tag] })
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <CalendarDays size={24} />
          <div>
            <h1>我的日历</h1>
            <p>本地优先 · 运行时提醒</p>
          </div>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={() => {
            setActiveEvent(emptyEvent())
            setEditorOpen(true)
          }}
        >
          <Plus size={18} />
          新建日程
        </button>

        <div className="view-switch" aria-label="日历视图">
          {[
            ['timeGridDay', '日'],
            ['timeGridWeek', '周'],
            ['dayGridMonth', '月'],
            ['multiMonthYear', '年'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={viewMode === value ? 'active' : ''}
              onClick={() => setViewMode(value as ViewMode)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="field compact-field">
          <span>搜索</span>
          <div className="search-control">
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applySearch()
              }}
              placeholder="标题、标签、地点"
            />
            <button type="button" title="搜索" onClick={applySearch}>
              <Search size={17} />
            </button>
          </div>
          {appliedSearch && (
            <p className="search-result">
              匹配 {filteredEvents.length} / {events.length}
            </p>
          )}
        </label>

        {appliedSearch && (
          <section className="search-results">
            {filteredEvents.length === 0 ? (
              <p className="empty-text">没有匹配的日程</p>
            ) : (
              filteredEvents.slice(0, 12).map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className="event-row"
                  onClick={() => focusEvent(event)}
                >
                  <span>{formatDateTime(event.startsAt)}</span>
                  <strong>{event.title}</strong>
                </button>
              ))
            )}
          </section>
        )}

        <section className="today-list">
          <h2>
            <ListChecks size={17} />
            今日
          </h2>
          {todayEvents.length === 0 ? (
            <p className="empty-text">今天没有日程</p>
          ) : (
            todayEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                className="event-row"
                onClick={() => focusEvent(event)}
              >
                <span>{formatDateTime(event.startsAt)}</span>
                <strong>{event.title}</strong>
              </button>
            ))
          )}
        </section>

        <div className="io-actions">
          <button className="secondary-button" type="button" onClick={importJson}>
            <Download size={17} />
            导入
          </button>
          <button className="secondary-button" type="button" onClick={exportJson}>
            <Upload size={17} />
            导出
          </button>
        </div>
        <p className="sidebar-status">{message}</p>
      </aside>

      <section className="calendar-pane">
        <div className="calendar-tools">
          <div className="theme-switch" aria-label="主题">
            {[
              ['light', '浅色', Sun],
              ['dark', '深色', Moon],
              ['system', '系统', Monitor],
            ].map(([value, label, Icon]) => {
              const ThemeIcon = Icon as typeof Sun
              return (
                <button
                  key={value as string}
                  type="button"
                  className={themeMode === value ? 'active' : ''}
                  title={`${label}主题`}
                  onClick={() => setThemeMode(value as ThemeMode)}
                >
                  <ThemeIcon size={16} />
                  <span>{label as string}</span>
                </button>
              )
            })}
          </div>
        </div>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, multiMonthPlugin, interactionPlugin]}
          initialView={viewMode}
          viewClassNames="calendar-view"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '',
          }}
          height="100%"
          locale="zh-cn"
          firstDay={1}
          nowIndicator
          editable={false}
          selectable
          dateClick={createForDate}
          eventClick={selectEvent}
          dayCellContent={(cell) => (
            <div className="day-cell-label">
              <div className="day-number-row">
                <span className="solar-day">{cell.dayNumberText}</span>
                {chinaHolidayMap.get(toDateKey(cell.date)) && (
                  <span
                    className={`holiday-badge ${
                      chinaHolidayMap.get(toDateKey(cell.date))?.type === 'holiday'
                        ? 'holiday-badge-rest'
                        : 'holiday-badge-work'
                    }`}
                  >
                    {chinaHolidayMap.get(toDateKey(cell.date))?.type === 'holiday' ? '休' : '班'}
                  </span>
                )}
              </div>
              <span className="lunar-day">
                {chinaHolidayMap.get(toDateKey(cell.date))?.name ?? getLunarLabel(cell.date)}
              </span>
            </div>
          )}
          events={filteredEvents.map((event) => ({
            id: String(event.id),
            title: `${event.completed ? '✓ ' : ''}${event.title}`,
            start: event.startsAt,
            end: event.endsAt,
            allDay: event.allDay,
            className: `priority-${event.priority}`,
          }))}
        />
      </section>

      {editorOpen && (
        <div className="editor-overlay" role="presentation" onMouseDown={() => setEditorOpen(false)}>
          <aside
            className="editor-pane"
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-editor-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="editor-header">
              <div>
                <h2 id="event-editor-title">{activeEvent.id ? '编辑日程' : '新建日程'}</h2>
                <p>{message}</p>
              </div>
              <div className="header-actions">
                <button
                  className="icon-button"
                  type="button"
                  title="切换预览"
                  onClick={() => setPreview((value) => !value)}
                >
                  <Eye size={18} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  title="关闭"
                  onClick={() => setEditorOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="editor-columns">
              <section className="editor-column">
                <label className="field">
                  <span>标题</span>
                  <input
                    value={activeEvent.title}
                    onChange={(event) => updateDraft({ title: event.target.value })}
                    placeholder="例如：周会 / 读书 / 复盘"
                    autoFocus
                  />
                </label>

                <div className="field">
                  <span>起止时间</span>
                  <DatePicker
                    selected={fromInputValue(activeEvent.startsAt)}
                    startDate={fromInputValue(activeEvent.startsAt)}
                    endDate={fromInputValue(activeEvent.endsAt)}
                    onChange={updateDateRange}
                    selectsRange
                    showTimeSelect
                    timeIntervals={15}
                    dateFormat="yyyy-MM-dd HH:mm"
                    calendarStartDay={1}
                    shouldCloseOnSelect={false}
                    placeholderText="选择开始和结束时间"
                    className="date-picker-input"
                  />
                </div>

                <div className="quick-flags">
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={activeEvent.allDay}
                      onChange={(event) => updateDraft({ allDay: event.target.checked })}
                    />
                    全天
                  </label>

                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={activeEvent.completed}
                      onChange={(event) => updateDraft({ completed: event.target.checked })}
                    />
                    完成
                  </label>
                </div>

                <div className="field">
                  <span>提醒时间</span>
                  <DatePicker
                    selected={fromInputValue(activeEvent.remindAt)}
                    onChange={(date: Date | null) =>
                      updateDraft({
                        remindAt: date ? toInputValue(date) : null,
                        notifiedAt: null,
                      })
                    }
                    showTimeSelect
                    isClearable
                    timeIntervals={15}
                    dateFormat="yyyy-MM-dd HH:mm"
                    calendarStartDay={1}
                    placeholderText="不提醒"
                    className="date-picker-input"
                  />
                </div>

                <div className="field">
                  <span>优先级</span>
                  <div className="priority-picker" role="radiogroup" aria-label="优先级">
                    {[
                      ['low', '低'],
                      ['normal', '普通'],
                      ['high', '高'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`priority-dot priority-dot-${value} ${
                          activeEvent.priority === value ? 'selected' : ''
                        }`}
                        role="radio"
                        aria-checked={activeEvent.priority === value}
                        title={`${label}优先级`}
                        onClick={() => updateDraft({ priority: value as Priority })}
                      >
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <label className="field">
                  <span>地点</span>
                  <input
                    value={activeEvent.location}
                    onChange={(event) => updateDraft({ location: event.target.value })}
                    placeholder="线上 / 办公室"
                  />
                  {frequentLocations.length > 0 && (
                    <div className="suggestion-tags" aria-label="常用地点">
                      {frequentLocations.map((location) => (
                        <button
                          key={location}
                          type="button"
                          onClick={() => updateDraft({ location })}
                        >
                          {location}
                        </button>
                      ))}
                    </div>
                  )}
                </label>

                <label className="field">
                  <span>标签</span>
                  <input
                    value={activeEvent.tags.join(', ')}
                    onChange={(event) =>
                      updateDraft({
                        tags: event.target.value
                          .split(',')
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="工作, 个人"
                  />
                  {frequentTags.length > 0 && (
                    <div className="suggestion-tags" aria-label="常用标签">
                      {frequentTags.map((tag) => (
                        <button key={tag} type="button" onClick={() => addTag(tag)}>
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </label>
              </section>

              <section className="editor-column">
                <label className="field markdown-field">
                  <span>Markdown 内容</span>
                  <textarea
                    value={activeEvent.body}
                    onChange={(event) => updateDraft({ body: event.target.value })}
                    placeholder="- [ ] 准备材料&#10;&#10;## 备注"
                  />
                </label>

                {preview && (
                  <section className="markdown-preview">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeEvent.body || '暂无 Markdown 内容'}
                    </ReactMarkdown>
                  </section>
                )}
              </section>
            </div>

            <div className="editor-actions">
              <button className="secondary-button danger" type="button" onClick={deleteActiveEvent}>
                <Trash2 size={17} />
                删除
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => updateDraft({ remindAt: toInputValue(new Date()), notifiedAt: null })}
              >
                <Bell size={17} />
                立即提醒
              </button>
              <button className="primary-button" type="button" onClick={saveActiveEvent}>
                <Save size={17} />
                保存
              </button>
            </div>

            {activeEvent.completed && (
              <div className="done-banner">
                <Check size={16} />
                这个日程已标记完成
              </div>
            )}
          </aside>
        </div>
      )}

      {reminderAlerts.length > 0 && (
        <section className="reminder-stack" aria-label="日程提醒">
          {reminderAlerts.map((event) => (
            <article key={event.id} className="reminder-card">
              <div>
                <strong>{event.title}</strong>
                <p>{formatDateTime(event.startsAt)} {event.location}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setReminderAlerts((current) => current.filter((item) => item.id !== event.id))
                }
              >
                <X size={16} />
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}

export default App
