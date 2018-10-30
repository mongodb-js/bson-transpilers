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

    this.processInt32 = this.processNumber;
    this.processDouble = this.processNumber;

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

  /**
   * Need process method because we want to pass the argument type to the template
   * so that we can determine if the generated number needs to be parsed or casted.
   *
   * @param {FuncCallExpressionContext} ctx
   * @returns {String}
   */
  processNumber(ctx) {
    const lhsStr = this.visit(ctx.singleExpression());
    let lhsType = this.findTypedNode(ctx.singleExpression()).type;
    if (typeof lhsType === 'string') {
      lhsType = this.Types[lhsType];
    }
    ctx.type = lhsType.id === 'Number' ? this.Types._decimal : lhsType.type;

    // Get the original type of the argument
    const expectedArgs = lhsType.args;
    let args = this.checkArguments(
      expectedArgs, this.getArguments(ctx), lhsType.id
    );
    let argType;

    if (args.length === 0) {
      args = ['0'];
      argType = this.Types._integer;
    } else {
      const argNode = this.getArgumentAt(ctx, 0);
      const typed = this.findTypedNode(argNode);
      argType = typed.originalType !== undefined ?
        typed.originalType :
        typed.type;
    }

    return this.generateCall(
      ctx, lhsType, [args[0], argType.id], lhsStr, `(${args.join(', ')})`
    );
  }


  /**
   * Convert between numeric types. Required so that we don't end up with
   * strange conversions like 'Int32(Double(2))', and can just generate '2'.
   *
   * @param {Array} expectedType - types to cast to.
   * @param {antlr4.ParserRuleContext} actualCtx - ctx to cast from, if valid.
   *
   * @returns {String} - visited result, or null on error.
   */
  castType(expectedType, actualCtx) {
    const result = this.visit(actualCtx);
    const originalCtx = actualCtx;
    actualCtx = this.findTypedNode(actualCtx);

    // If the types are exactly the same, just return.
    if (expectedType.indexOf(actualCtx.type) !== -1 ||
      expectedType.indexOf(actualCtx.type.id) !== -1) {
      return result;
    }

    const numericTypes = [
      this.Types._integer, this.Types._decimal, this.Types._hex,
      this.Types._octal, this.Types._long, this.Types._numeric
    ];
    // If the expected type is "numeric", accept the numeric basic types + numeric bson types
    if (expectedType.indexOf(this.Types._numeric) !== -1 &&
      (numericTypes.indexOf(actualCtx.type) !== -1 ||
        (actualCtx.type.id === 'Long' ||
          actualCtx.type.id === 'Int32' ||
          actualCtx.type.id === 'Double'))) {
      return result;
    }

    // Check if the arguments are both numbers. If so then cast to expected type.
    for (let i = 0; i < expectedType.length; i++) {
      if (numericTypes.indexOf(actualCtx.type) !== -1 &&
        numericTypes.indexOf(expectedType[i]) !== -1) {
        // Need to interpret octal always
        if (actualCtx.type.id === '_octal') {
          const node = {
            type: expectedType[i],
            originalType: actualCtx.type.id,
            children: [ actualCtx ]
          };
          return this.visitLiteralExpression(node);
        }
        actualCtx.originalType = actualCtx.type;
        actualCtx.type = expectedType[i];
        return this.visit(originalCtx);
      }
    }
    return null;
  }


  visitEmptyStatement() {
    return '\n';
  }

  /**
   * Child nodes: literal
   * @param {LiteralExpressionContext} ctx
   * @return {String}
   */
  visitLiteralExpression(ctx) {
    if (!ctx.type) {
      ctx.type = this.getPrimitiveType(ctx.literal());
    }
    this.requiredImports[ctx.type.code] = true;
    // Pass the original argument type to the template, not the casted type.
    const type = ctx.originalType === undefined ? ctx.type : ctx.originalType;
    if (`process${ctx.type.id}` in this) {
      return this[`process${ctx.type.id}`](ctx);
    }
    const children = this.visitChildren(ctx);
    return this.generateLiteral(ctx, ctx.type, [children, type.id], children, true);
  }

  /**
   * One terminal child.
   * @param {ElisionContext} ctx
   * @return {String}
   */
  visitElision(ctx) {
    ctx.type = this.Types._undefined;
    if (ctx.type.template) {
      return ctx.type.template();
    }
    return 'null';
  }

  /**
   * Skip new because already included in function calls for constructors
   *
   * @param {NewExpressionContext} ctx
   * @return {String}
   */
  visitNewExpression(ctx) {
    ctx.singleExpression().wasNew = true; // for dates only
    const res = this.visit(ctx.singleExpression());
    ctx.type = this.findTypedNode(ctx.singleExpression()).type;
    return res;
  }

  // //////////
  // Helpers //
  // //////////
  /**
   * Get the type of a node. TODO: nicer way to write it?
   * @param {LiteralContext} ctx
   * @return {Symbol}
   */
  getPrimitiveType(ctx) {
    if ('NullLiteral' in ctx) {
      return this.Types._null;
    }
    if ('UndefinedLiteral' in ctx) {
      return this.Types._undefined;
    }
    if ('BooleanLiteral' in ctx) {
      return this.Types._bool;
    }
    if ('StringLiteral' in ctx) {
      return this.Types._string;
    }
    if ('RegularExpressionLiteral' in ctx) {
      return this.Types._regex;
    }
    if ('numericLiteral' in ctx) {
      const number = ctx.numericLiteral();
      if ('IntegerLiteral' in number) {
        return this.Types._long;
      }
      if ('DecimalLiteral' in number) {
        return this.Types._decimal;
      }
      if ('HexIntegerLiteral' in number) {
        return this.Types._hex;
      }
      if ('OctalIntegerLiteral' in number) {
        return this.Types._octal;
      }
    }
    // TODO: or raise error?
    return this.Types._undefined;
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
    ctx.type = this.Types.BSONRegExpType;
    const symbolType = this.Symbols.BSONRegExp;

    const args = this.checkArguments(
      symbolType.args, this.getArguments(ctx), 'BSONRegExp'
    );

    let flags = null;
    const pattern = args[0];
    if (args.length === 2) {
      flags = args[1];
      for (let i = 1; i < flags.length - 1; i++) {
        if (!(flags[i] in this.Syntax.bsonRegexFlags)) {
          throw new BsonTranspilersRuntimeError(
            `Invalid flag '${flags[i]}' passed to BSONRegExp`
          );
        }
      }
      flags = flags.replace(/[imxlsu]/g, m => this.Syntax.bsonRegexFlags[m]);
    }

    return this.generateCall(
      ctx, symbolType, [pattern, flags], 'BSONRegExp',
      `(${pattern}${flags ? ', ' + flags : ''})`
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
    ctx.type = this.Types.Code;
    const symbolType = this.Symbols.Code;
    const argList = this.getArguments(ctx);
    if (!(argList.length === 1 || argList.length === 2)) {
      throw new BsonTranspilersArgumentError(
        'Argument count mismatch: Code requires one or two arguments'
      );
    }
    const code = this.getArgumentAt(ctx, 0).getText();
    let scope = undefined;
    let scopestr = '';

    if (argList.length === 2) {
      const idiomatic = this.idiomatic;
      this.idiomatic = false;
      scope = this.visit(this.getArgumentAt(ctx, 1));
      this.idiomatic = idiomatic;
      scopestr = `, ${scope}`;
      if (this.findTypedNode(this.getArgumentAt(ctx, 1)).type !== this.Types._object) {
        throw new BsonTranspilersArgumentError(
          'Argument type mismatch: Code requires scope to be an object'
        );
      }
      this.requiredImports[113] = true;
      this.requiredImports[10] = true;
    }
    return this.generateCall(ctx, symbolType, [code, scope], 'Code', `(${code}${scopestr})`);
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

  /**
   * Binary needs preprocessing because it needs to be executed. Manually check
   * argument length because 'Buffer' not supported.
   *
   * TODO: figure out if it ever makes sense to support Binary.
   */
  processBinary() {
    throw new BsonTranspilersUnimplementedError('Binary type not supported');
  }

  /**
   * Gets a process method because need to tell the template if
   * the argument is a number or a date.
   *
   * @param {ParserRuleContext} ctx
   * @returns {String} - generated code
   */
  processObjectIdCreateFromTime(ctx) {
    const lhsStr = this.visit(ctx.singleExpression());
    let lhsType = this.findTypedNode(ctx.singleExpression()).type;
    if (typeof lhsType === 'string') {
      lhsType = this.Types[lhsType];
    }

    const args = this.checkArguments(
      lhsType.args, this.getArguments(ctx), lhsType.id
    );
    const isNumber = this.getArgumentAt(ctx, 0).type.code !== 200;
    return this.generateCall(
      ctx, lhsType, [args[0], isNumber], lhsStr, `(${args.join(', ')})`, true
    );
  }

  // Getters
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
  // For a given sub document, get its key.
  getParentKeyStr(ctx) {
    return this.getKeyStr(ctx.parentCtx.parentCtx);
  }
  getObjectChild(ctx) {
    return ctx.getChild(0);
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

  /**
   * Takes in the constructor name of a node and returns a human-readable
   * node name. Used for error reporting.
   * @param {String} name
   * @return {String}
   */
  renameNode(name) {
    return name ? name.replace('Context', '') : 'Expression';
  }
};

