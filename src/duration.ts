// This library provides tools to manipulate durations.  A duration
// can have multiple formats:
//
//   - 3:12
//   - 1:23:45
//   - 1y 3d 3h 4min
//   - 1d3h5min
//   - 3d 13:35
//   - 2.35h
//
// More accurately, it consists of numbers and units, as defined in
// variable `org-duration-units', possibly separated with white
// spaces, and an optional "H:MM" or "H:MM:SS" part, which always
// comes last.  White spaces are tolerated between the number and its
// relative unit.  Variable `org-duration-format' controls durations
// default representation.
//
// The library provides functions allowing to convert a duration to,
// and from, a number of minutes: `org-duration-to-minutes' and
// `org-duration-from-minutes'.  It also provides two lesser tools:
// `org-duration-p', and `org-duration-h:mm-only-p'.
//
// Users can set the number of minutes per unit, or define new units,
// in `org-duration-units'.  The library also supports canonical
// duration, i.e., a duration that doesn't depend on user's settings,
// through optional arguments. 

import { print } from "util";

const RE_DURATION_PARSER       = new RegExp(`\\s*((?<years>[0-9.]+)y)?\\s*((?<days>[0-9.]+)d)?\\s*((?<hours>[0-9.]+)h)?\\s*((?<mins>[0-9.]+)min)?\\s*((?<thours>[0-9]+)\\:(?<tmins>[0-9]+)(\\:(?<tsecs>[0-9]+))?)?`);

declare global { interface DateConstructor {
    diff(a: Date, b: Date): OrgDuration;
    dayDiff(a: Date, b: Date): number;
    hourDiff(a: Date, b: Date): number;
    minDiff(a: Date, b: Date): number;
}}
Date.minDiff = function(a,b) {
    var ms = a.getTime() - b.getTime(); 
    return ms / (1000.0 * 60.0);     // Diference in mins
};
Date.diff = function(a,b) {
    return new OrgDuration(Date.minDiff(a,b));
};
Date.dayDiff = function(a,b) {
    var ms = a.getTime() - b.getTime(); 
    return ms / (1000 * 3600 * 24); // Diference in Days
};
Date.hourDiff = function(a,b) {
    var ms = a.getTime() - b.getTime(); 
    return ms / (1000 * 3600);      // Diference in Hours
};
// Extend Date with time modifiers
declare global{ interface Date {
    addHours(h: number): Date;
    addDays(d: number):  Date;
    addMins(m: number): Date;   
    addDuration(d: OrgDuration): Date;
    isToday(): boolean;
}}
Date.prototype.addDays = function(d) {
    this.setTime(this.getTime() + (d*24*60*60*1000));
    return this;
};
Date.prototype.addHours = function(h) {
    this.setTime(this.getTime() + (h*60*60*1000));
    return this;
};
Date.prototype.addMins = function(m) {
    this.setTime(this.getTime() + (m*60*1000));
    return this;
};
Date.prototype.addDuration = function(d) {
    this.setTime(this.getTime() + (d.mins*60*1000));
    return this;
};
Date.prototype.isToday = function (): boolean{
    let today = new Date();
    return this.isSameDate(today);
 };

export class OrgDuration {
    mins: number;
    public constructor(minutes: number) {
        this.mins = minutes;
    }

    public toString(): string {
       let r = "";
       const y = Math.floor(this.mins / 525600.0);
       if(y > 0 ) {
            r += y.toString() + "y";
       }
       const days = this.mins % 525600.0;
       const d    = Math.floor(days/1440.0);
       if(d > 0) {
            r += d.toString() + "d";
       }
       const hours = days % 1440.0;
       const h = Math.floor(hours / 60.0);
       if(h > 0) {
            r += h.toString() + "h";
       }
       const mins = Math.floor(hours % 60.0)
       if(mins > 0) {
            r += mins.toString() + "min";
       }
       return r.trim();
    }

    public days(): number {
        return this.mins/1440.0;
    }

    public sub(o): OrgDuration {
        if (typeof o === 'number') {
            //d = ParseInt(o);
        }
        return null;
    }

    public static parseNumber(d: number) {
        return new OrgDuration(d*1440.0);
    }

    public static parse(txt: string, need: boolean = false) {
        let m = RE_DURATION_PARSER.exec(txt);
        if(m) {
            let mtot = 0.0;
            let got  = false;
            const y = m.groups.years;
            if(y) {
                mtot += parseFloat(y)*525600.0;
                got   = true;
            }
            const d = m.groups.days;
            if(d) {
                mtot += parseFloat(d)*1440.0;
                got  = true;
            }
            const h = m.groups.hours;
            if(h) {
                mtot += parseFloat(h)*60.0;
                got   = true;
            }
            const mins = m.groups.mins;
            if(mins) {
                mtot += parseFloat(mins);
                got   = true;
            }
            const th = m.groups.thours;
            if(th) {
                mtot += parseFloat(th)*60.0;
                got   = true;
            }
            const tmins = m.groups.tmins;
            if(tmins) {
                mtot += parseFloat(tmins);
                got   = true;
            }
            const secs = m.groups.tsecs;
            if(secs) {
                mtot += parseFloat(secs)*0.01666667;
                got   = true;
            }
            if(got || !need) {
                return new OrgDuration(mtot)
            }
        }
        return null;
    }

    public static parseMonthOffset(txt: string) {
        if(txt.length < 3) {
            return null;
        }
        const change = ["january","febuary","march","april","may","june","july","august","september","october","november","december"];
        const tokens = txt.split(' ');
        let monthOffset = 0;
        let dayOffset   = 0;

        const now = new Date();
        const month = now.getMonth();
        const day   = now.getDate();
        for (const token in tokens) {
            const tk = token.toLowerCase()
            const monthCheck = change.findIndex(element => element.startsWith(tk)); 
            if (!isNaN(+tk)) {
                dayOffset = Number(tk)
            }
        }
        if(monthOffset == 0 && dayOffset == 0) {
            return null;
        }
        if(dayOffset == 0) {
            dayOffset = day
        }
        let dt = now;
        dt.setMonth(monthOffset);
        dt.setDate(dayOffset);
        return Date.diff(dt, now);
    }

    // Passing in a name of a day of the week, returns an OrgDuration
    // (with day granularity) from today to get to that day.
    // If today is Monday and you pass in Tuesday it will return
    // an OrgDuration with a 1 day offset
    public static parseWeekDayOffset(txt: string): OrgDuration {
        if(txt.length < 3) {
            return null;
        }
        const change = ["sunday", "monday","tuesday","wednesday","thursday","friday","saturday"];
        const nextDay = txt.toLowerCase();
        const nextOf = change.findIndex( element => element.startsWith(nextDay));
        if (nextOf === -1) {
            return null;
        }
        const wd = new Date().getDay();
        let offset = 0;
        // earlier in the week from today
        // have to add rest of week + into
        // next week.
        if(wd >= nextOf) {
            offset = 7-wd + nextOf;
        }
        // after today in week. Just 
        // add days past today.
        else {
            offset = nextOf - wd;
        }
        let mtot = 0.0;
        if(offset != 0) {
            mtot += offset*1440.0;
            return new OrgDuration(mtot);
        }
        return null;
    }
    
}
