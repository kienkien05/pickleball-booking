const BANGKOK_TIME_ZONE = 'Asia/Bangkok';

function pad(value) {
    return String(value).padStart(2, '0');
}

function normalizeDateString(value) {
    if (!value) return null;
    const datePart = String(value).trim().split(/[T\s]/)[0];
    return isValidDateString(datePart) ? datePart : null;
}

function isValidDateString(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;

    const [year, month, day] = String(value).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

function getBangkokParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: BANGKOK_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    });

    return formatter.formatToParts(date).reduce((parts, part) => {
        if (part.type !== 'literal') {
            parts[part.type] = Number(part.value);
        }
        return parts;
    }, {});
}

function getBangkokTodayString(date = new Date()) {
    const parts = getBangkokParts(date);
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function getBangkokTimestampString(date = new Date()) {
    const parts = getBangkokParts(date);
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function parseTimeToMinutes(value) {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
    if (!match) return null;

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
}

function isSlotInFuture(dateValue, startTime, now = new Date()) {
    const dateStr = normalizeDateString(dateValue);
    const startMinutes = parseTimeToMinutes(startTime);
    if (!dateStr || startMinutes === null) return false;

    const today = getBangkokTodayString(now);
    if (dateStr < today) return false;
    if (dateStr > today) return true;

    const nowParts = getBangkokParts(now);
    const nowMinutes = nowParts.hour * 60 + nowParts.minute;
    return startMinutes > nowMinutes;
}

function addDaysToDateString(dateValue, days) {
    const dateStr = normalizeDateString(dateValue);
    if (!dateStr) return null;

    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function getMondayIndex(dateValue) {
    const dateStr = normalizeDateString(dateValue);
    if (!dateStr) return null;

    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (date.getUTCDay() + 6) % 7;
}

function getNextWeekWindowForWeekday(weekday, now = new Date()) {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        return null;
    }

    const today = getBangkokTodayString(now);
    const todayWeekday = getMondayIndex(today);
    const nextMonday = addDaysToDateString(today, 7 - todayWeekday);

    return {
        targetDate: addDaysToDateString(nextMonday, weekday),
        runAt: `${nextMonday} 00:00:00`
    };
}

function getNextAutoScheduleFromTargetDate(targetDate) {
    const nextTargetDate = addDaysToDateString(targetDate, 7);
    const weekday = getMondayIndex(nextTargetDate);
    const monday = addDaysToDateString(nextTargetDate, -weekday);

    return {
        targetDate: nextTargetDate,
        runAt: `${monday} 00:00:00`
    };
}

module.exports = {
    normalizeDateString,
    isValidDateString,
    getBangkokTodayString,
    getBangkokTimestampString,
    getMondayIndex,
    getNextWeekWindowForWeekday,
    getNextAutoScheduleFromTargetDate,
    isSlotInFuture
};
