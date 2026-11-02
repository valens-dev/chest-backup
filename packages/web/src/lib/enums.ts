import { DestinationType, LogLevel, RunSort, RunStatus, RunTrigger } from "@chest-backup/shared"
import { ActivityTab, TimeRange } from "@/types/activity"

const RUN_STATUS_BY_VALUE = new Map<string, RunStatus>(Object.values(RunStatus).map((status) => [status, status]))
const RUN_TRIGGER_BY_VALUE = new Map<string, RunTrigger>(Object.values(RunTrigger).map((trigger) => [trigger, trigger]))
const LOG_LEVEL_BY_VALUE = new Map<string, LogLevel>(Object.values(LogLevel).map((level) => [level, level]))
const RUN_SORT_BY_VALUE = new Map<string, RunSort>(Object.values(RunSort).map((sort) => [sort, sort]))
const TIME_RANGE_BY_VALUE = new Map<string, TimeRange>(Object.values(TimeRange).map((range) => [range, range]))
const ACTIVITY_TAB_BY_VALUE = new Map<string, ActivityTab>(Object.values(ActivityTab).map((tab) => [tab, tab]))
const DESTINATION_TYPE_BY_VALUE = new Map<string, DestinationType>(Object.values(DestinationType).map((type) => [type, type]))

const toRunStatus = (value: string): RunStatus | null => RUN_STATUS_BY_VALUE.get(value) ?? null
const toRunTrigger = (value: string): RunTrigger | null => RUN_TRIGGER_BY_VALUE.get(value) ?? null
const toLogLevel = (value: string): LogLevel | null => LOG_LEVEL_BY_VALUE.get(value) ?? null
const toRunSort = (value: string): RunSort => RUN_SORT_BY_VALUE.get(value) ?? RunSort.Newest
const toTimeRange = (value: string): TimeRange => TIME_RANGE_BY_VALUE.get(value) ?? TimeRange.All
const toActivityTab = (value: string): ActivityTab => ACTIVITY_TAB_BY_VALUE.get(value) ?? ActivityTab.Runs
const toDestinationType = (value: string): DestinationType => DESTINATION_TYPE_BY_VALUE.get(value) ?? DestinationType.Local

const toDestinationTypeFromForm = (form: Record<string, unknown>): DestinationType =>
  toDestinationType(typeof form.type === "string" ? form.type : "")

export { toRunStatus, toRunTrigger, toLogLevel, toRunSort, toTimeRange, toActivityTab, toDestinationType, toDestinationTypeFromForm }
