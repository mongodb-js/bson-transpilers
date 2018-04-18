/* eslint complexity: 0 */
const {doubleQuoteStringify} = require('../../helper/format');
const {
  SemanticArgumentCountMismatchError,
  SemanticGenericError,
  SemanticTypeError
} = require('../../helper/error');

/**
 * @param {class} superClass - where the `visitX` methods live.
 * @returns {Generator}
 */
module.exports = (superClass) => class ExtendedVisitor extends superClass {
  constructor() {
    super();
    this.new = 'new ';
    this.regex_flags = {
      i: 'i', m: 'm', u: 'u', y: '', g: ''
    };
    this.binary_subTypes = {
      0: 'org.bson.BsonBinarySubType.BINARY',
      1: 'org.bson.BsonBinarySubType.FUNCTION',
      2: 'org.bson.BsonBinarySubType.BINARY',
      3: 'org.bson.BsonBinarySubType.UUID_LEGACY',
      4: 'org.bson.BsonBinarySubType.UUID',
      5: 'org.bson.BsonBinarySubType.MD5',
      128: 'org.bson.BsonBinarySubType.USER_DEFINED'
    };
  }

  /**
   * Ignore the new keyword because JS could either have it or not, but we always
   * need it in Java so we'll add it when we call constructors.
   * TODO: do we ever need the second arguments expr?
   *
   * Child nodes: singleExpression arguments?
   *
   * @param {NewExpressionContext} ctx
   * @return {String}
   */
  emitNew(ctx) {
    const expr = this.visit(ctx.singleExpression());
    ctx.type = ctx.singleExpression().type;
    return expr;
  }

  /**
   * Special cased bc they're different in every lang.
   *
   * child nodes: arguments
   * grandchild nodes: argumentList?
   * great-grandchild nodes: singleExpression+
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  emitRegExp(ctx) {
    ctx.type = this.Types.Regex;
    let pattern;
    let flags;
    try {
      const regexobj = this.executeJavascript(ctx.getText());
      pattern = regexobj.source;
      flags = regexobj.flags;
    } catch (error) {
      throw new SemanticGenericError({message: error.message});
    }

    let javaflags = flags.replace(/[imuyg]/g, m => this.regex_flags[m]);
    javaflags = javaflags === '' ? '' : `(?${javaflags})`;

    // Double escape characters except for slashes
    const escaped = pattern.replace(/\\(?!\/)/, '\\\\');

    return `Pattern.compile(${doubleQuoteStringify(escaped + javaflags)})`;
  }

  /**
   * Special cased because different target languages need different info out
   * of the constructed date.
   *
   * child nodes: arguments
   * grandchild nodes: argumentList?
   * great-grandchild nodes: singleExpression+
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  emitDate(ctx) {
    ctx.type = this.Types.Date;
    const args = ctx.arguments();
    if (!args.argumentList()) {
      return 'new java.util.Date()';
    }
    let epoch;
    try {
      epoch = this.executeJavascript(ctx.getText()).getTime();
    } catch (error) {
      throw new SemanticGenericError({message: error.message});
    }
    return `new java.util.Date(${epoch})`;
  }

  /**
   * Expects two strings as arguments, the second must contain any of "imxlsu"
   *
   * child nodes: arguments
   * grandchild nodes: argumentList?
   * great-grandchild nodes: singleExpression+
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  emitBSONRegExp(ctx) {
    ctx.type = this.Types.RegExp;
    const argList = ctx.arguments().argumentList();
    const args = this.checkArguments([[this.Types._string], [this.Types._string, null]], argList);

    if (args.length === 2) {
      const flags = args[1];
      for (let i = 1; i < flags.length - 1; i++) {
        if (
          !(
            flags[i] === 'i' ||
            flags[i] === 'm' ||
            flags[i] === 'x' ||
            flags[i] === 'l' ||
            flags[i] === 's' ||
            flags[i] === 'u'
          )
        ) {
          return `Error: the regular expression options [${flags[i]}] is not supported`;
        }
      }
      return `new BsonRegularExpression(${args[0]}, ${flags})`;
    }
    return `new BsonRegularExpression(${args[0]})`;
  }

  /**
   * The arguments to Code can be either a string or actual javascript code.
   * Manually check arguments here because first argument can be any JS, and we
   * don't want to ever visit that node.
   *
   * TODO: could move this to javascript/visitor and use template.
   *
   * child nodes: arguments
   * grandchild nodes: argumentList?
   * great-grandchild nodes: singleExpression+
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  emitCodeFromJS(ctx) {
    ctx.type = this.Types.Code;
    const argList = ctx.arguments().argumentList();
    if (!argList ||
      !(argList.singleExpression().length === 1 ||
        argList.singleExpression().length === 2)) {
      throw new SemanticArgumentCountMismatchError({
        message: 'Code requires one or two arguments'
      });
    }
    const args = argList.singleExpression();
    const code = doubleQuoteStringify(args[0].getText());

    if (args.length === 2) {
      /* NOTE: we have to visit the subtree first before type checking or type may
        not be set. We might have to just suck it up and do two passes, but maybe
        we can avoid it for now. */
      const scope = this.visit(args[1]);
      if (args[1].type !== this.Types._object) {
        throw new SemanticTypeError({
          message: 'Code requires scope to be an object'
        });
      }
      return `new CodeWithScope(${code}, ${scope})`;
    }

    return `new Code(${code})`;
  }

  /**
   * TODO: Could move this to javascript/Visitor and use template
   *
   * child nodes: arguments
   * grandchild nodes: argumentList?
   * great-grandchild nodes: singleExpression+
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  emitObjectId(ctx) {
    ctx.type = this.Types.ObjectId;
    const argList = ctx.arguments().argumentList();
    if (!argList) {
      return 'new ObjectId()';
    }
    let hexstr;
    try {
      hexstr = this.executeJavascript(ctx.getText()).toHexString();
    } catch (error) {
      throw new SemanticGenericError({message: error.message});
    }
    return `new ObjectId(${doubleQuoteStringify(hexstr)})`;
  }

  /**
   * TODO: Maybe move this to javascript/Visitor and use template?
   *
   * child nodes: arguments
   * grandchild nodes: argumentList?
   * great-grandchild nodes: singleExpression+
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  emitBinary(ctx) {
    ctx.type = this.Types.Binary;
    let type;
    let binobj;
    try {
      binobj = this.executeJavascript(ctx.getText());
      type = binobj.sub_type;
    } catch (error) {
      throw new SemanticGenericError({message: error.message});
    }
    const bytes = doubleQuoteStringify(binobj.toString());
    const argList = ctx.arguments().argumentList().singleExpression();
    if (argList.length === 1) {
      return `new Binary(${bytes}.getBytes("UTF-8"))`;
    }
    return `new Binary(${this.binary_subTypes[type]}, ${bytes}.getBytes("UTF-8"))`;
  }

  /**
   * TODO: Maybe move this to javascript/Visitor and use template?
   *
   * child nodes: arguments
   * grandchild nodes: argumentList?
   * great-grandchild nodes: singleExpression+
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  emitLong(ctx) {
    ctx.type = this.Types.Long;
    let longstr;
    try {
      longstr = this.executeJavascript(ctx.getText()).toString();
    } catch (error) {
      throw new SemanticGenericError({message: error.message});
    }
    return `new java.lang.Long(${doubleQuoteStringify(longstr)})`;
  }

  /**
   * TODO: Could move this to javascript/Visitor and use template
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  emitDecimal128(ctx) {
    ctx.type = this.Types.Decimal128;
    let decobj;
    try {
      decobj = this.executeJavascript(`new ${ctx.getText()}`);
    } catch (error) {
      throw new SemanticGenericError({message: error.message});
    }
    const str = doubleQuoteStringify(decobj.toString());
    return `Decimal128.parse(${str})`;
  }

  /*  ************** Object methods **************** */

  emitCodetoJSON(ctx) {
    ctx.type = this.Types._object;
    const argsList = ctx.singleExpression().singleExpression().arguments();
    const args = argsList.argumentList().singleExpression();
    const code = doubleQuoteStringify(args[0].getText());
    let scope = 'undefined';

    if (args.length === 2) {
      scope = this.visit(args[1]);
    }

    return `new Document().append("code", ${code}).append("scope", ${scope})`;
  }

  emitDecimal128toJSON(ctx) {
    ctx.type = this.Types._object;
    return `new Document().append("$numberDecimal", ${this.visit(ctx.singleExpression().singleExpression())}.toString())`;
  }

  emitDBReftoJSON(ctx) {
    ctx.type = this.Types._object;
    const argsList = ctx.singleExpression().singleExpression().arguments();
    const args = argsList.argumentList().singleExpression();

    const ns = this.visit(args[0]);
    const oid = this.visit(args[1]);
    let db = '""';
    if (args.length === 3) {
      db = this.visit(args[2]);
    }
    return `new Document().append("$ref", ${ns}).append("$id", ${oid}).append(\"$db\", ${db})`;
  }

  emitLongfromBits(ctx) {
    return this.emitLong(ctx);
  }

  emitLongtoString(ctx) {
    ctx.type = this.Types._string;
    const lhsType = ctx.singleExpression().type;
    const long = ctx.singleExpression().singleExpression();
    let longstr;
    try {
      longstr = this.executeJavascript(long.getText()).toString();
    } catch (error) {
      throw new SemanticGenericError({message: error.message});
    }
    const stringArgs = ctx.arguments().argumentList();
    if (!stringArgs) {
      return `java.lang.Long.toString(${longstr})`;
    }
    const arg = this.checkArguments(lhsType.args, stringArgs).join(', ');
    return `java.lang.Long.toString(${longstr}, ${arg})`;
  }
};