// Client-facing labels for the attendance incident types. Source names are kept exactly as listed in workbook R41
// (listed by James as a core KPI); labels only make them readable and never merge categories.
import type {IncidentType} from '../data/people';

const TIMECARD_NOTE = '"Timecard" and "Exception" are the source category suffixes (how UKG records the event); their exact difference is not documented in the supplied sources and is to be confirmed.';

export const INCIDENT_LABEL: Record<IncidentType, {label: string; help: string}> = {
  'Late In >15': {
    label: 'Late arrivals',
    help: 'Source category: Late In >15. The threshold unit and business rule are pending confirmation.',
  },
  'More than half shift unworked': {label: 'More than half of shift not worked', help: 'Source category "More than half shift unworked" (workbook R41).'},
  'Absent Unpaid Timecard': {label: 'Unpaid absence (timecard)', help: `Source category "Absent Unpaid Timecard" (workbook R41). ${TIMECARD_NOTE}`},
  'Absent Unpaid Exception': {label: 'Unpaid absence (exception)', help: `Source category "Absent Unpaid Exception" (workbook R41). ${TIMECARD_NOTE}`},
  'No Call No Show Timecard': {label: 'No call, no show (timecard)', help: `Source category "No Call No Show Timecard" (workbook R41): absent without notifying the store. ${TIMECARD_NOTE}`},
  'Sick Unpaid Timecard': {label: 'Unpaid sick time (timecard)', help: `Source category "Sick Unpaid Timecard" (workbook R41). ${TIMECARD_NOTE}`},
};

/** Visible note: attendance stays in the proposed view; the data dependency is stated, not resolved (D35). */
export const ATTENDANCE_AVAILABILITY_NOTE = 'Attendance reporting is included in the proposed view. Data availability following the Workday migration is pending confirmation.';
export const ATTENDANCE_AVAILABILITY_HELP = 'Attendance information is currently available in UKG. Its availability following the Workday migration still needs confirmation (D35).';

export const ATTENDANCE_SOURCE_NOTE =
  'Categories as listed in workbook R41 (attendance data comes from UKG); no supplied OPS report carries attendance categories. R41 also lists "Worked Shift - Daily Total" and "Scheduled Hours - Daily Total", which are totals rather than incidents and are not counted. Counts are illustrative synthetic events; the calculation (D22) and data availability following the Workday migration (D35) are pending confirmation.';
