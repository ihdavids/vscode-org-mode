import * as datefns from 'date-fns';
import * as vscode from 'vscode';
import * as Utils from './utils';
import {Sets} from './sets';

const weekdayArray = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ISimpleDate {
    year: number;
    month: number;
    day: number;
    weekday: string;
    active: boolean;
}

export interface ISimpleDateTime extends ISimpleDate {
    hours: number;
    minutes: number;
}

export function parseDateTime(dateString: string): ISimpleDateTime {
    const dateRegExp = /\s*(?<active>[<\[])?\s*(?<year>\d{4})-(?<month>\d{1,2})-(?<day>\d{1,2})\s*((?<hours>\d{1,2})\:(?<mins>\d{1,2}))?/;
    const dateResult = dateRegExp.exec(dateString);

    const year = dateResult ? parseInt(dateResult.groups.year, 10) : undefined;
    const month = dateResult ? parseInt(dateResult.groups.month, 10) : undefined;
    const day = dateResult ? parseInt(dateResult.groups.day, 10) : undefined;
    let active: boolean = dateResult ? dateResult.groups.active === '<' : false;
    const hours = dateResult  && dateResult.groups.hours ? parseInt(dateResult.groups.hours, 10) : undefined; 
    const minutes = dateResult && dateResult.groups.mins ? parseInt(dateResult.groups.mins, 10) : undefined; 

    const weekdayRegExp = /[A-Za-z]{3}/;
    const weekdayResult = weekdayRegExp.exec(dateString);
    let weekday;
    if (weekdayResult) {
        weekday = weekdayResult[0];
    }
    return { year, month, day, weekday, active, hours, minutes };
};

export function parseDate(dateString: string): ISimpleDate {
    const dateRegExp = /([<\[])?\s*(\d{4})-(\d{1,2})-(\d{1,2})/;
    const dateResult = dateRegExp.exec(dateString);

    const year = dateResult ? parseInt(dateResult[2], 10) : undefined;
    const month = dateResult ? parseInt(dateResult[3], 10) : undefined;
    const day = dateResult ? parseInt(dateResult[4], 10) : undefined;
    let active: boolean = dateResult ? dateResult[1] === '<' : false;


    const weekdayRegExp = /[A-Za-z]{3}/;
    const weekdayResult = weekdayRegExp.exec(dateString);
    let weekday;
    if (weekdayResult) {
        weekday = weekdayResult[0];
    }
    return { year, month, day, weekday, active };
};

export function isValidSimpleDate(datetime: ISimpleDate): boolean {
    return Boolean(datetime.year) && Boolean(datetime.month) && Boolean(datetime.day);
}

export function buildDateString(datetime: ISimpleDate): string {
    const { year, month, day, weekday } = datetime;

    let dateString = `${year}-${month}-${day}`;
    if (Sets.leftZero) {
        dateString = padDate(dateString);
    }
    if (weekday) {
        dateString = `${dateString} ${weekday}`;
    }

    if (datetime.active) {
        return `<${dateString}>`
    } else {
        return `[${dateString}]`
    }
};

export function buildDateTimeString(datetime: ISimpleDateTime): string {
    const { year, month, day, hours, minutes, weekday } = datetime;

    let dateString = `${year}-${month}-${day}`;
    let timeString = `${hours}:${minutes}`;
    if (Sets.leftZero) {
        dateString = padDate(dateString);
        timeString = padTime(timeString);
    }
    if (weekday) {
        dateString = `${dateString} ${weekday}`;
    }

    if (datetime.active) {
        return `<${dateString} ${timeString}>`
    } else {
        return `[${dateString} ${timeString}]`
    }
};

function padDate(str: string): string {
    const regex = /-(\d)(-|$)/;
    while (regex.exec(str) !== null) {
        str = str.replace(regex, '-0$1$2');
    }
    return str;
}

function padTime(str: string): string {
    const regex = /(^|:)(\d)(:|$)/;
    while (regex.exec(str) !== null) {
        str = str.replace(regex, '$10$2$3');
    }
    return str;
}

export function dateToSimpleDate(dateObject: Date, active: boolean = false): ISimpleDate {
    const year = dateObject.getFullYear();
    const month = dateObject.getMonth() + 1; // Why, Javascript, why!?
    const day = dateObject.getDate();

    const weekday = weekdayArray[dateObject.getDay()];

    return {
        day,
        month,
        weekday,
        year,
        active
    }
}

export function dateToSimpleDateTime(dateObject: Date): ISimpleDateTime {
    const simpleDateTime = dateToSimpleDate(dateObject) as ISimpleDateTime;
    simpleDateTime.hours = dateObject.getHours();
    simpleDateTime.minutes = dateObject.getMinutes();

    return simpleDateTime;
}
export function simpleDateTimeToDate(obj: ISimpleDateTime): Date {
    if (obj.hours === undefined || obj.minutes === undefined) {
        return new Date(obj.year,obj.month-1,obj.day);
    } else {
        return new Date(obj.year,obj.month-1,obj.day,obj.hours, obj.minutes);
    }
}

export function simpleDateToDate(obj: ISimpleDate): Date {
    const dt = new Date(obj.year,obj.month,obj.day);
    return dt;
}

export function hasTime(inStr: string): boolean {
    const v = parseDateTime(inStr);
    return (v.hours !== undefined);
}

export function dateToRawString(dt: Date, includeTime: boolean): string {
    const year    = dt.getFullYear();
    const month   = dt.getMonth() + 1; // Why, Javascript, why!?
    const day     = dt.getDate();
    //const weekday = weekdayArray[dt.getDay()];

    let dateString = `${year}-${month}-${day}`;

    if (Sets.leftZero) {
        dateString = padDate(dateString);
    }
    /*
    if (weekday) {
        dateString = `${dateString} ${weekday}`;
    }
    */

    if (includeTime) {
        const hours   = dt.getHours();
        const minutes = dt.getMinutes();
        let timeString = `${hours}:${minutes}`;
        if (Sets.leftZero) {
            timeString = padTime(timeString);
        }
        return `${dateString} ${timeString}`
    }
    return dateString
}

export function currentDate(): ISimpleDate {
    return dateToSimpleDate(new Date());
}

export function currentDateTime(): ISimpleDateTime {
    return dateToSimpleDateTime(new Date());
}

export function modifyDate(dateString: string, action: string): string {
    const oldDate = parseDate(dateString);
    const initialDateObject = datefns.parse(`${oldDate.year}-${oldDate.month}-${oldDate.day}`);

    const dateObject = (action === "UP") ? datefns.addDays(initialDateObject, 1): datefns.addDays(initialDateObject, -1);

    const newDate = dateToSimpleDate(dateObject);
    newDate.active = oldDate.active;
    if (!oldDate.weekday) {
        newDate.weekday = undefined;
    }

    return buildDateString(newDate);
}

export function getClockTotal(line) {
    const separator = Sets.clockTotalSeparator;

    const regex = /\d{1,2}:\d{1,2}/g;
    const match = line.match(regex);

    if (match.length < 2) { return ''; }

    const clockIn = new Date(`2017-01-01 ${match[0]}`);
    const clockOut = new Date(`2017-01-01 ${match[1]}`);
    const clock = clockOut.getTime() - clockIn.getTime();
    const hours = Math.floor(clock / (60 * 60 * 1000));
    const minutes = clock / (60 * 1000) - (60 * hours);

    let clockString = `${hours}:${minutes}`;
    if (Sets.leftZero) {
        clockString = padTime(clockString);
    }

    return clockString;
}