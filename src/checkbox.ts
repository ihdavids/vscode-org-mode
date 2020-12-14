import * as utils from "./utils";
import {TextDocument, Position} from "vscode";


let summaryRe         = new RegExp('(\[\d*[/%]\d*\])');
let checkboxRe        = new RegExp('(\[[xX\- ]\])');
let checkboxLineRe    = new RegExp('\s*[-+]?\s*(\[[xX\- ]\])\s+');
let headingRe = new RegExp('^[*]+ ');

function findParent(doc : TextDocument, pos: Position) : Position
{
    return utils.findBeginningOfSection(doc, pos, "*");
}

// Returns a list of child checkbox line numbers (Do I want that to be positions)?
function findChildren(doc : TextDocument, pos: Position)
{
    let row = pos.line;
    let indent = utils.getIndent(doc.lineAt(row).text).length;
    let lastRow = doc.lineCount;
    let childIndent = indent;
    let children = [];
    while(row < lastRow)
    {
        let content = doc.lineAt(row);
        if(content.text.trim().startsWith("*"))
        {
            break;
        }
        if(checkboxRe.test(content.text))
        {
            let curIndent = utils.getIndent(content.text).length;
            if(curIndent <= indent)
            {
                break;
            }
            if(childIndent == indent)
            {
                childIndent = indent;
            }
            if(curIndent == childIndent)
            {
                children.push(row);            
            }
        }
        row += 1;
    }
    return children;
}

function findSiblings(doc: TextDocument, child : Position, parent: Position)
{
    let siblings = [];
    let row = parent.line;
    let parentIndent = utils.getIndent(doc.lineAt(row).text);
    let childIndent  = utils.getIndent(doc.lineAt(child).text);
    row += 1;
    while(row <= doc.lineCount)
    {
        let content : string = doc.lineAt(row).text;
        if(content.trim().length)
        {
            let curIndent = utils.getIndent(content);
            if(curIndent.length <= parentIndent.length)
            {
                // Indent same as parent found! exit out.
                break;
            }
            if(curIndent.length == childIndent.length)
            {
                siblings.push([row,content])                
            }
        }
        row += 1;
    }
    return siblings;
}

function getSummary(doc : TextDocument, pos: Position)
{
    let row  = pos.line;
    let content = doc.lineAt(pos).text
    let m = summaryRe.exec(content)
    if(!m)
    {
        return null;
    }
    let start = m.index;
    let end = m.index + m[0].length;
    return [new Position(row, start), new Position(row, end)];
}

function getCheckbox(doc: TextDocument, pos: Position)
{
    let row = pos.line;
    let content = doc.lineAt(pos).text;
    let m = checkboxRe.exec(content);
    if(!m)
    {
        return null;
    }
    let start = m.index;
    let end = m.index + m[0].length;
    return [new Position(row, start), new Position(row, end)];
}

enum CheckState
{
    Indeterminate,
    Unchecked,
    Checked,
    Error
}

function getCheckState(doc: TextDocument, pos: Position)
{
    let line = doc.lineAt(pos).text;
    if(line.indexOf('[-]') >= 0)
    {
        return CheckState.Indeterminate;
    }
    if(line.indexOf('[ ]') >= 0)
    {
        return CheckState.Unchecked;
    }
    if(line.indexOf('[X]') >= 0 || line.indexOf('[x]') >= 0)
    {
        return CheckState.Checked
    }
    return CheckState.Error
}

function getCheckChar(doc: TextDocument, state: CheckState)
{
    if(state == CheckState.Unchecked)
    {
        return ' ';
    }
    else if(state == CheckState.Checked)
    {
        return 'x';
    }
    else if(state == CheckState.Indeterminate)
    {
        return '-';
    }
    else
    {
        return 'E';
    }
}

function recalcSummary(doc: TextDocument, pos: Position)
{
    let children = findChildren(doc, pos);
    let numChildren = children.length;
    if(numChildren <= 0)
    {
        return [0,0];
    }
    let checkedChildren = children.reduce( (child) => {
        return getCheckState(doc, child) == CheckState.Checked;
    });
    let numChecked = checkedChildren.length;
    return [numChildren, checkedChildren];
}

function updateLine(doc: TextDocument, pos: Position, parentUpdate: boolean)
{
    let [numChildren, numChecked] = recalcSummary(doc, pos);
    // No children to update
    if(numChildren <= 0)
    {
        return false;
    }
    // Update region checkbox
    let newState = CheckState.Unchecked;
    if(numChildren == numChecked)
    {
        newState = CheckState.Checked;
    }
    else
    {
        if(numChecked != 0)
        {
            newState = CheckState.Indeterminate;
        }        
        else
        {
            newState = CheckState.Unchecked;
        }
    }
    // TODO: Continue here
}

def update_line(view, edit, region, parent_update=True):
    #print ('update_line', self.view.rowcol(region.begin())[0]+1)
    (num_children, checked_children) = recalc_summary(view, region)
    # No children we don't have to update anything else.
    if num_children <= 0:
        return False
    # update region checkbox
    if checked_children == num_children:
        newstate = CheckState.Checked
    else:
        if checked_children != 0:
            newstate = CheckState.Indeterminate
        else:
            newstate = CheckState.Unchecked
    toggle_checkbox(view, edit, region, newstate)
    # update region summary
    update_summary(view, edit, region, checked_children, num_children)
    children = find_children(view, region)
    for child in children:
        line = view.line(child)
        summary = get_summary(view, view.line(child))
        if summary:
            return update_line(view, edit, line, parent_update=False)
    if parent_update:
        parent = find_parent(view, region)
        if parent:
            update_line(view, edit, parent)
    return True

def update_summary(view, edit, region, checked_children, num_children):
    # print('update_summary', self.view.rowcol(region.begin())[0]+1)
    summary = get_summary(view, region)
    if not summary:
        return False
    # print('checked_children: ' + str(checked_children) + ', num_children: ' + str(num_children))
    line = view.substr(summary)
    if("%" in line):
        view.replace(edit, summary, '[{0}%]'.format(int(checked_children/num_children*100)))
    else:
        view.replace(edit, summary, '[%d/%d]' % (checked_children, num_children))

def toggle_checkbox(view, edit, region, checked=None, recurse_up=False, recurse_down=False):
    # print 'toggle_checkbox', self.view.rowcol(region.begin())[0]+1
    checkbox = get_checkbox(view, region)
    if not checkbox:
        return False
    if checked is None:
        check_state = get_check_state(view, region)
        if (check_state == CheckState.Unchecked) | (check_state == CheckState.Indeterminate):
            check_state = CheckState.Checked
        elif (check_state == CheckState.Checked):
            check_state = CheckState.Unchecked
    else:
        check_state = checked
    view.replace(edit, checkbox, '[%s]' % ( get_check_char(view, check_state)))
    if recurse_down:
        # all children should follow
        children = find_children(view, region)
        for child in children:
            toggle_checkbox(view, edit, child, check_state, recurse_down=True)
    if recurse_up:
        # update parent
        parent = find_parent(view, region)
        if parent:
            update_line(view, edit, parent)

def is_checkbox(view, sel):
    names = view.scope_name(sel.end())
    return 'orgmode.checkbox' in names or 'orgmode.checkbox.checked' in names or 'orgmode.checkbox.blocked' in names

def is_checkbox_line(view,sel=None):
    point = None
    if(sel == None):
        row = view.curRow()
        point = view.text_point(row, 0)
    else:
        point = sel.end()
    line = view.line(point)
    content = view.substr(line)
    return checkbox_line_regex.search(content)

def find_all_summaries(view):
    return view.find_by_selector("orgmode.checkbox.summary")

def recalculate_checkbox_summary(view, sel, edit):
    line    = view.line(sel.begin())
    update_line(view, edit, line)

def recalculate_all_checkbox_summaries(view, edit):
    sums = find_all_summaries(view)
    for sel in sums:
        recalculate_checkbox_summary(view, sel, edit)

cline_info_regex = re.compile(r'^(\s*)([-+0-9](\.)?)?.*$')
class OrgInsertCheckboxCommand(sublime_plugin.TextCommand):
    def run(self, edit):
        row = self.view.curRow()
        line = self.view.getLine(row)
        match = cline_info_regex.match(line)
        indent = match.group(1)
        start  = match.group(2)
        if(start):
            indent = indent + start + " [ ] "
        reg = self.view.curLine()
        self.view.insert(edit,reg.end(),"\n" + indent)
        # Move to end of line
        row = row + 1
        pt = self.view.text_point(row,0)
        ln = self.view.line(pt)
        self.view.sel().clear()
        self.view.sel().add(ln.end())


cbsline_info_regex = re.compile(r'^(\s*)(.*)\[\s*[0-9]*/[0-9]\s*\]\s*$')
class OrgInsertCheckboxSummaryCommand(sublime_plugin.TextCommand):
    def run(self, edit):
        row = self.view.curRow()
        line = self.view.getLine(row)
        match = cbsline_info_regex.match(line)
        if(not match):
            reg = self.view.curLine()
            self.view.insert(edit,reg.end()," [/] ")
            recalculate_all_checkbox_summaries(self.view, edit)

class OrgToggleCheckboxCommand(sublime_plugin.TextCommand):
    def run(self, edit):
        view = self.view
        for sel in view.sel():
            if(not is_checkbox_line(view, sel)):
                continue
            line     = view.line(sel.end())
            toggle_checkbox(view, edit, line, recurse_up=True, recurse_down=True)
        recalculate_all_checkbox_summaries(self.view, edit)


class OrgRecalcCheckboxSummaryCommand(sublime_plugin.TextCommand):
    def run(self, edit):
        view = self.view
        backup = []
        for sel in view.sel():
            if 'orgmode.checkbox.summary' not in view.scope_name(sel.end()):
                continue
            backup.append(sel)
            #summary = view.extract_scope(sel.end())
            line = view.line(sel.end())
            update_line(view, edit, line)
        view.sel().clear()
        for region in backup:
            view.sel().add(region)


class OrgRecalcAllCheckboxSummariesCommand(sublime_plugin.TextCommand):
    def run(self, edit):
        recalculate_all_checkbox_summaries(self.view, edit)
