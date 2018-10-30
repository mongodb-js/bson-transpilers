/* eslint complexity: 0 */
const bson = require('bson');
const Context = require('context-eval');
const {
  BsonTranspilersArgumentError,
  BsonTranspilersRuntimeError,
  BsonTranspilersUnimplementedError
} = require('../../helper/error');
const { removeQuotes } = require('../../helper/format');


/**
 * This is a Visitor that visits the tree generated by the ECMAScript.g4 grammar.
 *
 * @param {CodeGenerationVisitor} CodeGenerationVisitor - class shared between
 * all visitors.
 * @return {Visitor} - Input-language specific visitor.
 */
module.exports = (CodeGenerationVisitor) => class Visitor extends CodeGenerationVisitor {
  constructor() {
    super();
    this.startRule = 'program'; // Name of the ANTLR rule to start

    // Throw UnimplementedError for nodes with expressions that we don't support
    this.visitThisExpression =
    this.visitDeleteExpression =
    this.visitVoidExpression =
    this.visitTypeofExpression =
    this.visitInExpression =
    this.visitInstanceofExpression =
    this.visitFuncDefExpression =
    this.visitAssignmentExpression =
    this.visitAssignmentOperatorExpression =
    this.visitMemberIndexExpression =
    this.visitTernaryExpression =
    this.visitFunctionDeclaration =
    this.visitVariableStatement =
    this.visitIfStatement =
    this.visitDoWhileStatement =
    this.visitWhileStatement =
    this.visitForStatement =
    this.visitForVarStatement =
    this.visitForInStatement =
    this.visitForVarInStatement =
    this.visitContinueStatement =
    this.visitBreakStatement =
    this.visitReturnStatement =
    this.visitWithStatement =
    this.visitLabelledStatement =
    this.visitSwitchStatement =
    this.visitThrowStatement =
    this.visitTryStatement =
    this.visitDebuggerStatement =
      this.unimplemented;
  }

  /*
   *
   * Visit Methods
   *
   */

  visitFuncCallExpression(ctx) {
    return this.generateFunctionCall(ctx);
  }

  visitIdentifierExpression(ctx) {
    return this.generateIdentifier(ctx);
  }

  visitGetAttributeExpression(ctx) {
    return this.generateAttributeAccess(ctx);
  }

  visitObjectLiteral(ctx) {
    return this.generateObjectLiteral(ctx);
  }

  visitArrayLiteral(ctx) {
    return this.generateArrayLiteral(ctx);
  }

  visitNullLiteral(ctx) {
    return this.leafHelper(this.Types._null, ctx);
  }

  visitUndefinedLiteral(ctx) {
    return this.leafHelper(this.Types._undefined, ctx);
  }

  visitBooleanLiteral(ctx) {
    return this.leafHelper(this.Types._bool, ctx);
  }

  visitStringLiteral(ctx) {
    return this.leafHelper(this.Types._string, ctx);
  }

  visitRegularExpressionLiteral(ctx) {
    return this.leafHelper(this.Types._regex, ctx);
  }

  visitIntegerLiteral(ctx) {
    return this.leafHelper(this.Types._long, ctx);
  }

  visitDecimalLiteral(ctx) {
    return this.leafHelper(this.Types._decimal, ctx);
  }

  visitHexIntegerLiteral(ctx) {
    return this.leafHelper(this.Types._hex, ctx);
  }

  visitOctalIntegerLiteral(ctx) {
    return this.leafHelper(this.Types._octal, ctx);
  }

  visitEmptyStatement() {
    return '\n';
  }

  visitElision(ctx) {
    ctx.type = this.Types._undefined;
    if (ctx.type.template) {
      return ctx.type.template();
    }
    return 'null';
  }

  visitNewExpression(ctx) {
    // Skip new because already included in function calls for constructors.
    ctx.singleExpression().wasNew = true; // for dates only
    const res = this.visit(ctx.singleExpression());
    ctx.type = this.findTypedNode(ctx.singleExpression()).type;
    return res;
  }

  visitRelationalExpression(ctx) {
    return ctx.children.map((n) => ( this.visit(n) )).join(' ');
  }

  visitEqualityExpression(ctx) {
    ctx.type = this.Types._boolean;
    const lhs = this.visit(ctx.singleExpression()[0]);
    const rhs = this.visit(ctx.singleExpression()[1]);
    const op = this.visit(ctx.children[1]);
    if (this.Syntax.equality) {
      return this.Syntax.equality.template(lhs, op, rhs);
    }
    return this.visitChildren(ctx);
  }

  visitLogicalAndExpression(ctx) {
    if (this.Syntax.and) {
      return this.Syntax.and.template(ctx.singleExpression().map((t) => (this.visit(t))));
    }
    return this.visitChildren(ctx);
  }

  visitLogicalOrExpression(ctx) {
    if (this.Syntax.or) {
      return this.Syntax.or.template(ctx.singleExpression().map((t) => ( this.visit(t) )));
    }
    return this.visitChildren(ctx);
  }

  visitNotExpression(ctx) {
    if (this.Syntax.not) {
      return this.Syntax.not.template(this.visit(ctx.singleExpression()));
    }
    return this.visitChildren(ctx);
  }

  /*
   *
   * Process Methods
   *
   */

  /* Numerical process methods */
  processNumber(ctx) {
    return this.generateNumericClass(ctx);
  }

  processInt32(ctx) {
    return this.generateNumericClass(ctx);
  }

  processDouble(ctx) {
    return this.generateNumericClass(ctx);
  }

  /**
   * Check arguments then execute in the same way as regex literals.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  processRegExp(ctx) {
    this.checkArguments(
      this.Symbols.RegExp.args, this.getArguments(ctx), 'RegExp'
    );
    return this.process_regex(ctx);
  }

  /**
   * This looks like non-camelcase because the name of the basic type is "_regex"
   * and the process methods are constructed with "Process" + <type name>.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  process_regex(ctx) { // eslint-disable-line camelcase
    ctx.type = this.Types._regex;
    let pattern;
    let flags;

    try {
      const regexobj = this.executeJavascript(ctx.getText());
      pattern = regexobj.source;
      flags = regexobj.flags;
    } catch (error) {
      throw new BsonTranspilersRuntimeError(error.message);
    }

    let targetflags = flags.replace(/[imuyg]/g, m => this.Syntax.regexFlags[m]);
    targetflags = targetflags === '' ?
      '' :
      `${targetflags.split('').sort().join('')}`;

    return this.generateLiteral(ctx, ctx.type, [pattern, targetflags], 'RegExp');
  }

  /**
   * Process BSON regexps because we need to verify the flags are valid.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {string}
   */
  processBSONRegExp(ctx) {
    return this.generateBSONRegex(
      ctx, this.Types.BSONRegExpType, this.Symbols.BSONRegExp
    );
  }

  /**
   * The arguments to Code can be either a string or actual javascript code.
   * Manually check arguments here because first argument can be any JS, and we
   * don't want to ever visit that node.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  processCodeFromJS(ctx) {
    return this.generateBSONCode(ctx, this.Types.Code, this.Symbols.Code, false);
  }

  /**
   * ObjectId needs preprocessing because it needs to be executed.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  processObjectId(ctx) {
    ctx.type = this.Types.ObjectId;
    const symbolType = this.Symbols.ObjectId;
    const lhs = symbolType.template ? symbolType.template() : 'ObjectId';
    const argsList = this.getArguments(ctx);

    if (argsList.length === 0) {
      return this.Syntax.new.template
        ? this.Syntax.new.template(`${lhs}()`, false, ctx.type.code)
        : `${lhs}()`;
    }

    this.checkArguments(symbolType.args, argsList, 'ObjectId');
    let hexstr;
    try {
      hexstr = this.executeJavascript(ctx.getText()).toHexString();
    } catch (error) {
      throw new BsonTranspilersRuntimeError(error.message);
    }
    return this.generateCall(ctx, symbolType, [hexstr], 'ObjectId', `(${hexstr})`);
  }

  /**
   * Long needs preprocessing because it needs to be executed.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  processLong(ctx) {
    ctx.type = this.Types.Long;
    const symbolType = this.Symbols.Long;
    let longstr;
    this.checkArguments(symbolType.args, this.getArguments(ctx), 'Long');
    try {
      longstr = this.executeJavascript(`new ${ctx.getText()}`).toString();
    } catch (error) {
      throw new BsonTranspilersRuntimeError(error.message);
    }
    return this.generateCall(ctx, symbolType, [longstr, '_long'], 'Long', `(${longstr})`);
  }

  processLongfromBits(ctx) {
    return this.processLong(ctx);
  }

  /**
   * Decimal128 needs preprocessing because it needs to be executed. Check
   * argument length manually because 'Buffer' not supported.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  processDecimal128(ctx) {
    ctx.type = this.Types.Decimal128;
    const symbolType = this.Symbols.Decimal128;
    let decstr;
    const argList = this.getArguments(ctx);

    if (argList.length !== 1) {
      throw new BsonTranspilersArgumentError(
        'Argument count mismatch: Decimal128 requires one argument'
      );
    }

    try {
      decstr = this.executeJavascript(`new ${ctx.getText()}`).toString();
    } catch (error) {
      // TODO: this isn't quite right because it catches all type errors.
      if (error.name === 'TypeError' || error.code === 'ERR_INVALID_ARG_TYPE') {
        throw new BsonTranspilersArgumentError(error.message);
      }

      throw new BsonTranspilersRuntimeError(error.message);
    }
    return this.generateCall(ctx, symbolType, [decstr], 'Decimal128', `(${decstr})`);
  }

  /**
   * This is a bit weird because we can just convert to string directly.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  processLongtoString(ctx) {
    ctx.type = this.Types._string;
    const long = ctx.singleExpression().singleExpression();
    let longstr;
    this.checkArguments([[this.Types._numeric, null]], this.getArguments(ctx), 'Long toString');

    try {
      longstr = this.executeJavascript(long.getText()).toString();
    } catch (error) {
      throw new BsonTranspilersRuntimeError(error.message);
    }
    return ctx.type.template ? ctx.type.template(longstr) : `'${longstr}'`;
  }

  /**
   * Preprocessed because different target languages need different info out
   * of the constructed date, so we want to execute it. Passes a constructed
   * date object to the template or generator.
   *
   * @param {FuncCallExpressionContext} ctx
   * @return {String}
   */
  processDate(ctx) {
    const isStr = !(ctx.getText().includes('ISODate') || ctx.wasNew);
    const symbolType = this.Symbols.Date;

    ctx.type = this.Types.Date;
    if (isStr) {
      ctx.type = this.Types._string;
      this.requiredImports[201] = true;
    }

    const argsList = this.getArguments(ctx);
    let date = null;

    if (argsList.length !== 0) {
      try {
        this.checkArguments(this.Symbols.Date.args, argsList, 'Date');
      } catch (e) {
        throw new BsonTranspilersArgumentError(
          'Invalid argument to Date: requires either no args, one string or number, or up to 7 numbers'
        );
      }

      let text = ctx.getText();
      text = text.startsWith('new ') ? text : `new ${text}`;
      try {
        date = this.executeJavascript(text);
      } catch (error) {
        throw new BsonTranspilersRuntimeError(error.message);
      }
    }
    const dargs = `Date(${date
      ? this.Types._string.template(date.toUTCString())
      : ''})`;
    return this.generateCall(
      ctx, symbolType, [date, isStr], '', dargs, isStr, true
    );
  }

  processObjectIdCreateFromTime(ctx) {
    return this.generateObjectIdFromTime(ctx);
  }

  processBinary() {
    throw new BsonTranspilersUnimplementedError('Binary type not supported');
  }

  /*
   *
   * Helper Methods
   *
   */

  /**
   * Takes in the constructor name of a node and returns a human-readable
   * node name. Used for error reporting, must be defined by all visitors.
   *
   * @param {String} name
   * @return {String}
   */
  renameNode(name) {
    return name ? name.replace('_stmt', '') : 'Expression';
  }

  /**
   * Execute javascript in a sandbox.
   *
   * @param {String} input
   * @return {*} result of execution
   */
  executeJavascript(input) {
    const sandbox = {
      RegExp: RegExp,
      BSONRegExp: bson.BSONRegExp,
      // Binary: bson.Binary,
      DBRef: bson.DBRef,
      Decimal128: bson.Decimal128,
      Double: bson.Double,
      Int32: bson.Int32,
      Long: bson.Long,
      Int64: bson.Long,
      Map: bson.Map,
      MaxKey: bson.MaxKey,
      MinKey: bson.MinKey,
      ObjectID: bson.ObjectID,
      ObjectId: bson.ObjectID,
      Symbol: bson.Symbol,
      Timestamp: bson.Timestamp,
      Code: function(c, s) {
        return new bson.Code(c, s);
      },
      Date: function(s) {
        const args = Array.from(arguments);

        if (args.length === 1) {
          return new Date(s);
        }

        return new Date(Date.UTC(...args));
      },
      Buffer: Buffer,
      __result: {}
    };
    const ctx = new Context(sandbox);
    const res = ctx.evaluate('__result = ' + input);
    ctx.destroy();
    return res;
  }

  /*
   * Accessor Functions.
   *
   * These MUST be defined by every visitor. Each function is a wrapper around
   * a tree node. They are required so that the CodeGenerationVisitor and the
   * Generators can access tree elements without needing to know which tree they
   * are visiting or the ANTLR name of the node.
   */

  getArguments(ctx) {
    if (!('arguments' in ctx) ||
        !('argumentList' in ctx.arguments()) ||
        !ctx.arguments().argumentList()) {
      return [];
    }
    return ctx.arguments().argumentList().singleExpression();
  }

  getArgumentAt(ctx, i) {
    return this.getArguments(ctx)[i];
  }

  getFunctionCallName(ctx) {
    return ctx.singleExpression();
  }

  getIfIdentifier(ctx) {
    if ('identifierName' in ctx) {
      return ctx.singleExpression();
    }
    return ctx;
  }

  getAttributeLHS(ctx) {
    return ctx.singleExpression();
  }

  getAttributeRHS(ctx) {
    return ctx.identifierName();
  }

  getList(ctx) {
    if (!('elementList' in ctx) || !ctx.elementList()) {
      return [];
    }
    const elisions = ctx.elementList().elision();
    const elements = ctx.elementList().singleExpression();
    return ctx.elementList().children.filter((c) => {
      return elisions.indexOf(c) !== -1 || elements.indexOf(c) !== -1;
    });
  }

  getArray(ctx) {
    if (!('arrayLiteral' in ctx)) {
      return false;
    }
    return ctx.arrayLiteral();
  }

  getObject(ctx) {
    if (!('objectLiteral' in ctx)) {
      return false;
    }
    return ctx.objectLiteral();
  }

  getKeyValueList(ctx) {
    if ('propertyNameAndValueList' in ctx && ctx.propertyNameAndValueList()) {
      return ctx.propertyNameAndValueList().propertyAssignment();
    }
    return [];
  }

  getKeyStr(ctx) {
    return removeQuotes(this.visit(ctx.propertyName()));
  }

  getValue(ctx) {
    return ctx.singleExpression();
  }

  isSubObject(ctx) {
    return 'propertyName' in ctx.parentCtx.parentCtx;
  }

  getParentKeyStr(ctx) {
    // For a given sub document, get its key.
    return this.getKeyStr(ctx.parentCtx.parentCtx);
  }

  getObjectChild(ctx) {
    return ctx.getChild(0);
  }
};

