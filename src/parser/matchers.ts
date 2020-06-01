export class OrgRe {
    public static RE_NODE_HEADER    = /^\*+ /;
    public static RE_INDENT_REPLACE = /^[ \t]*/;
    public static RE_DRAWER         = /^\s*:([a-zA-Z][a-zA-Z0-9_-]*):\s*$/;

    public static RE_LINK = /(?:\[\[(?P<desc0>[^\]]+)\]\])|(?:\[\[(?P<link1>[^\]]+)\]\[(?P<desc1>[^\]]+)\]\])/;

    // Replace links in the text to their descriptive names without the []
    public static ToPlainText(text:string): string {
        return text.replace(OrgRe.RE_LINK,function (total, desc0, link1, desc1) { 
            if(desc0) {
                return desc0; 
            } else { 
                return desc1; 
            }
        });
    }
}