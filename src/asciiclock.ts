import { Utils } from "./utils";

class AsciiCanvas
{
    public cols = 0;
    public lines = 0;
    public canvas : Array< Array<any> > = []
    public fill_char : any = ' ';
    constructor(cols, lines, fill_char = ' ') {
        if (cols < 1 || cols > 1000 || lines < 1 || lines > 1000) {
            throw "Canvas cols/lines must be in range [1..1000]";
        }
        this.cols = cols;
        this.lines = lines;
        if (!fill_char) {
            fill_char = ' ';
        }
        this.fill_char = fill_char;
        this.canvas = []
        for (let i = 0; i < this.lines; ++i) {
            let line = [];
            for (let j = 0; j < this.cols; ++j) {
                line.push(this.fill_char);
            }
            this.canvas.push(line);
        }
    }

    public clear() {
        for (let i = 0; i < this.lines; ++i) {
            for (let j = 0; j < this.cols; ++j) {
                this.canvas[i][j] = this.fill_char;
            }
        }
    }

    public get_canvas_as_str() : string {
        let ret = "";
        for (let i = 0; i < this.lines; ++i) {
            ret += this.canvas[i].join("");
            ret += "\n";
        }
        return ret;
    }

    public print_out() {
       const out = this.get_canvas_as_str();
       console.log(out);
    }

    // Check that coordinate (x, y) is in range, to prevent out of range error
    public check_coord_in_range(x, y) {
        return 0 <= x && x < this.cols && 0 <= y && y < this.lines;
    }


    // Add line x0, y0 -> x1, y1 to the canvas, fill line with 'fill_char'
    public add_line(x0, y0, x1, y1, fill_char='o') {
        if (!fill_char) {
            fill_char = 'o';
        }
        if (x0 > x1) {
            let t = x1;
            x1 = x0;
            x0 = t; 
            t = y1;
            y1 = y0;
            y0 = t;
        }
        const dx = x1 - x0;
        const dy = y1 - y0;
        if (dx == 0 && dy == 0) {
            if (this.check_coord_in_range(x0,y0)) {
                this.canvas[y0][x0] = fill_char;
            }
            return;
        }
        // when dx >= dy use fill by x-axis, and use fill by y-axis otherwise
        if (Math.abs(dx) >= Math.abs(dy)) {
            for (let x = x0; x <= x1; x++) {
                let y = y0;
                if (dx != 0) {
                    y = y0 + Math.trunc(Math.round((x - x0) * dy / dx))
                }
                if (this.check_coord_in_range(x, y)) {
                    this.canvas[y][x] = fill_char;
                }
            }
        }
        else {
            if (y0 < y1) {
                for (let y = y0; y <= y1; y++) {
                    let x = x0;
                    if (dy != 0) {
                        x = x0 + Math.trunc(Math.round(y - y0) * dx / dy)
                    }
                    if (this.check_coord_in_range(x, y)) {
                        this.canvas[y][x] = fill_char;
                    }
                }
            } else {
                for (let y = y0; y <= y1; y++) {
                    let x = x0;
                    if (dy != 0) {
                        x = x1 + Math.trunc(Math.round(y - y1) * dx / dy)
                    }
                    if (this.check_coord_in_range(x, y)) {
                        this.canvas[y][x] = fill_char;
                    }
                }
            }
        }
    }

    // Add text to canvas at position (x, y)
    public add_text(x: number, y: number, text: string) {
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (this.check_coord_in_range(x+i, y)) {
                this.canvas[y][x+i] = c;
            }
        }
    }

    // Add rectangle filled with `fill_char` and outline with `outline_char`
    public add_rect(x, y, w, h, fill_char=' ', outline_char='o') {
        if (!fill_char) {
            fill_char = ' ';
        }
        if (!outline_char) {
            outline_char = 'o';
        }
        for (let px = x; px < x+w; px++) {
            for (let py = y; py < y+h; py++) {
                if (this.check_coord_in_range(px, py)) {
                    if (px == x || px == x + w - 1 || py == y || py == y + h - 1) {
                        this.canvas[py][px] = outline_char;
                    }
                    else {
                        this.canvas[py][px] = fill_char;
                    }
                }
            }
        }
    }

    public get_row(i) {
        if (i > 0 && i < this.canvas.length) {
            return this.canvas[i].join();
        }
        return '';
    }


    // Add nine-patch rectangle
    public add_nine_patch_rect(x, y, w, h, outline_3x3_chars=null) {
        const default_outline_3x3_chars = [
            '.', '-', '.', 
            '|', ' ', '|', 
            '`', '-', "'"
        ];
        if (!outline_3x3_chars) {
            outline_3x3_chars = default_outline_3x3_chars
        }
        // filter chars
        let filtered_outline_3x3_chars = []
        for (let index = 0; index < 9; ++index) {
            let char = outline_3x3_chars[index];
            if (!char) {
                char = default_outline_3x3_chars[index];
            }
            filtered_outline_3x3_chars.push(char);
        }
        for (let px = x; px < x+w; px++) {
            for (let py = y; py < y+h; py++) {
                if (this.check_coord_in_range(px, py)) {
                    if (px == x && py == y) {
                        this.canvas[py][px] = filtered_outline_3x3_chars[0];
                    } else if (px == x && y < py && py < y + h - 1) {
                        this.canvas[py][px] = filtered_outline_3x3_chars[3];
                    } else if (px == x && py == y + h - 1) {
                        this.canvas[py][px] = filtered_outline_3x3_chars[6];
                    } else if (x < px && px < x + w - 1 && py == y) {
                        this.canvas[py][px] = filtered_outline_3x3_chars[1];
                    } else if (x < px && px < x + w - 1 && py == y + h - 1) {
                        this.canvas[py][px] = filtered_outline_3x3_chars[7];
                    } else if (px == x + w - 1 && py == y) {
                        this.canvas[py][px] = filtered_outline_3x3_chars[2];
                    } else if (px == x + w - 1 && y < py && py < y + h - 1) {
                        this.canvas[py][px] = filtered_outline_3x3_chars[5];
                    } else if (px == x + w - 1 && py == y + h - 1) {
                        this.canvas[py][px] = filtered_outline_3x3_chars[8];
                    } else {
                        this.canvas[py][px] = filtered_outline_3x3_chars[4];
                    }
                }
            }
        }
    }
}

const x_scale_ratio = 1.75;

// Draw our clock seconds hand
function draw_second_hand(ascii_canvas : AsciiCanvas, seconds, length, fill_char) {
    const x0 = Math.trunc(Math.ceil(ascii_canvas.cols / 2.0));
    const y0 = Math.trunc(Math.ceil(ascii_canvas.lines / 2.0));
    const x1 = x0 + Math.trunc(Math.cos((seconds + 45) * 6 * Math.PI / 180) * length * x_scale_ratio);
    const y1 = y0 + Math.trunc(Math.sin((seconds + 45) * 6 * Math.PI / 180) * length);
    ascii_canvas.add_line(Math.trunc(x0), Math.trunc(y0), Math.trunc(x1), Math.trunc(y1), fill_char);
}

// Draw our clock minutes hand
function draw_minute_hand(ascii_canvas : AsciiCanvas, minutes, length, fill_char) {
    const x0: number = Math.trunc(Math.ceil(ascii_canvas.cols / 2.0));
    const y0: number = Math.trunc(Math.ceil(ascii_canvas.lines / 2.0));
    const x1: number = x0 + Math.trunc(Math.cos((minutes + 45) * 6 * Math.PI / 180) * length * x_scale_ratio);
    const y1: number = y0 + Math.trunc(Math.sin((minutes + 45) * 6 * Math.PI / 180) * length);
    ascii_canvas.add_line(Math.trunc(x0), Math.trunc(y0), Math.trunc(x1), Math.trunc(y1), fill_char);
}

// Draw our clocks hour hand
function draw_hour_hand(ascii_canvas :AsciiCanvas, hours, minutes, length, fill_char) {
    const x0: number = Math.trunc(Math.ceil(ascii_canvas.cols / 2.0));
    const y0: number = Math.trunc(Math.ceil(ascii_canvas.lines / 2.0));
    const total_hours: number = hours + minutes / 60.0;
    const x1: number = x0 + Math.trunc(Math.cos((total_hours + 45) * 30 * Math.PI / 180) * length * x_scale_ratio);
    const y1: number = y0 + Math.trunc(Math.sin((total_hours + 45) * 30 * Math.PI / 180) * length);
    ascii_canvas.add_line(Math.trunc(x0), Math.trunc(y0), Math.trunc(x1), Math.trunc(y1), fill_char=fill_char);
}

// Draw clock face with hour and minute marks
function draw_clock_face(ascii_canvas, radius, mark_char) {
    const x0 = ascii_canvas.cols / 2;
    const y0 = ascii_canvas.lines / 2;
    // draw marks first
    const max_mark = 12*5+1
    for (let mark = 1; mark < max_mark; ++mark) {
        const x1 = x0 + Math.trunc(Math.cos((mark + 45) * 6 * Math.PI / 180) * radius * x_scale_ratio);
        const y1 = y0 + Math.trunc(Math.sin((mark + 45) * 6 * Math.PI / 180) * radius);
        if (mark % 5 != 0) {
            ascii_canvas.add_text(x1, y1, mark_char);
        }
    }
    // start from 1 because at 0 index - 12 hour
    for (let mark=1; mark < (12+1); ++mark) {
        const x1 = x0 + Math.trunc(Math.cos((mark + 45) * 30 * Math.PI / 180) * radius * x_scale_ratio);
        const y1 = y0 + Math.trunc(Math.sin((mark + 45) * 30 * Math.PI / 180) * radius);
        ascii_canvas.add_text(x1, y1, mark);
    }

}

// Draw an ascii clock
export function draw_clock(now: Date, cols: number, lines: number): AsciiCanvas {
    if (cols < 25 || lines < 25) {
        console.log('Too little columns/lines for print out the clock!');
        return null;
    }
    // prepare chars
    const single_line_border_chars = ['.', '-', '.', '|', ' ', '|', '`', '-', "'"];
    const second_hand_char = '.';
    const minute_hand_char = 'o';
    const hour_hand_char = 'O';
    const mark_char = '`';
    //if os.name == 'nt':
    //    single_line_border_chars = ('.', '-', '.', '|', ' ', '|', '`', '-', "'")  # ('\xDA', '\xC4', '\xBF', '\xB3', '\x20', '\xB3', '\xC0', '\xC4', '\xD9')
    //    second_hand_char = '.'  # '\xFA'
    //    minute_hand_char = 'o'  # '\xF9'
    //    hour_hand_char = 'O'  # 'o'
    //    mark_char = '`'  # '\xF9'
    // create ascii canvas for clock and eval vars
    let ascii_canvas = new AsciiCanvas(cols, lines);
    const center_x = Math.trunc(Math.ceil(cols / 2.0));
    const center_y = Math.trunc(Math.ceil(lines / 2.0));
    const radius = center_y - 5;
    const second_hand_length = Math.trunc(radius / 1.17);
    const minute_hand_length = Math.trunc(radius / 1.25);
    const hour_hand_length = Math.trunc(radius / 1.95);
    // add clock region and clock face
    // ascii_canvas.add_rect(5, 3, int(math.floor(cols / 2.0)) * 2 - 9, int(math.floor(lines / 2.0)) * 2 - 5)
    draw_clock_face(ascii_canvas, radius, mark_char);
    // now = datetime.datetime.now()
    // add regions with weekday and day if possible
    if (center_x > 25) {
        const left_pos = Math.trunc(radius * x_scale_ratio) / 2 - 4;
        ascii_canvas.add_nine_patch_rect(Math.trunc(center_x + left_pos), Math.trunc(center_y - 1), 5, 3, single_line_border_chars);
        ascii_canvas.add_text(Math.trunc(center_x + left_pos + 1), Math.trunc(center_y), now.getDay().toString() /*now.strftime('%a')*/);
        ascii_canvas.add_nine_patch_rect(Math.trunc(center_x + left_pos + 5), Math.trunc(center_y - 1), 4, 3, single_line_border_chars);
        ascii_canvas.add_text(Math.trunc(center_x + left_pos + 1 + 5), Math.trunc(center_y), now.getDay().toString() /*now.strftime('%d')*/);
    }
    // add clock hands
    //draw_second_hand(ascii_canvas, now.second, second_hand_length, fill_char=second_hand_char)
    draw_minute_hand(ascii_canvas, now.getMinutes(), minute_hand_length, minute_hand_char);
    draw_hour_hand(ascii_canvas, now.getHours(), now.getMinutes(), hour_hand_length, hour_hand_char);
    // print out canvas
    return ascii_canvas;
    // ascii_canvas.print_out()
}