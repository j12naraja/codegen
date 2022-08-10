/*
Copyright 2022 The Apex Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseVisitor, Context, Visitor, Writer } from "@apexlang/core/model";
import { expandType, mapParams, methodName, returnPointer } from "./helpers";
import { EnumVisitor } from "./enum_visitor";
import { StructVisitor } from "./struct_visitor";
import { ImportsVisitor } from "./imports_visitor";
import { AliasVisitor, translateAlias } from "./alias_visitor";
import { formatComment, isHandler, isProvider, isVoid, noCode } from "../utils";
import { UnionVisitor } from "./union_visitor";

export class InterfacesVisitor extends BaseVisitor {
  // Overridable visitor implementations
  importsVisitor = (writer: Writer): Visitor => new ImportsVisitor(writer);
  providerVisitor = (writer: Writer): Visitor => new ProviderVisitor(writer);
  handlerVisitor = (writer: Writer): Visitor => new HandlerVisitor(writer);
  aliasVisitor = (writer: Writer): Visitor => new AliasVisitor(writer);
  enumVisitor = (writer: Writer): Visitor => new EnumVisitor(writer);
  unionVisitor = (writer: Writer): Visitor => new UnionVisitor(writer);
  structVisitor = (writer: Writer): Visitor => new StructVisitor(writer, true);

  visitNamespaceBefore(context: Context): void {
    const packageName = context.config.package || "module";
    this.write(`// Code generated by @apexlang/codegen. DO NOT EDIT.
    
    package ${packageName}
      
      import (\n`);
    const visitor = this.importsVisitor(this.writer);
    const ns = context.namespace;
    ns.accept(context, visitor);
    this.write(`
      )\n\n
      type ns struct{}

      func (n *ns) Namespace() string {
        return "${ns.name}"
      }\n\n`);

    ns.annotation("version", (a) => {
      this.write(`func (n *ns) Version() string {
          return "${a.arguments[0].value.getValue()}"
        }\n\n`);
    });
    super.triggerNamespaceBefore(context);
  }

  visitRoleBefore(context: Context): void {
    const { role } = context;
    if (isProvider(context)) {
      const visitor = this.providerVisitor(this.writer);
      role.accept(context, visitor);
    } else if (isHandler(context)) {
      const visitor = this.handlerVisitor(this.writer);
      role.accept(context, visitor);
    }
  }

  visitAlias(context: Context): void {
    const visitor = this.aliasVisitor(this.writer);
    context.alias.accept(context, visitor);
  }

  visitEnum(context: Context): void {
    const visitor = this.enumVisitor(this.writer);
    context.enum.accept(context, visitor);
  }

  visitUnion(context: Context): void {
    const visitor = this.unionVisitor(this.writer);
    context.union.accept(context, visitor);
  }

  visitType(context: Context): void {
    const visitor = this.structVisitor(this.writer);
    context.type.accept(context, visitor);
  }
}

export class HandlerVisitor extends BaseVisitor {
  visitRoleBefore(context: Context): void {
    const { role } = context;
    this.write(formatComment("// ", role.description));
    this.write(`type ${role.name} interface {\n`);
  }

  visitOperation(context: Context): void {
    const { operation } = context;
    if (noCode(operation)) {
      return;
    }
    this.write(formatComment("// ", operation.description));
    this.write(`${methodName(operation, operation.name)}(ctx context.Context`);
    if (operation.parameters.length > 0) {
      this.write(`, `);
    }
    const translate = translateAlias(context);
    this.write(
      `${mapParams(context, operation.parameters, undefined, translate)})`
    );
    if (!isVoid(operation.type)) {
      this.write(
        ` (${returnPointer(context, operation.type)}${expandType(
          operation.type,
          undefined,
          true,
          translate
        )}, error)`
      );
    } else {
      this.write(` error`);
    }
    this.write(`\n`);
  }

  visitRoleAfter(context: Context): void {
    this.write(`}\n\n`);
  }
}

export class ProviderVisitor extends BaseVisitor {
  private contextPackage: string;

  constructor(writer: Writer, contextPackage: string = "context.") {
    super(writer);
    this.contextPackage = contextPackage;
  }

  visitRoleBefore(context: Context): void {
    const { role } = context;
    this.write(formatComment("// ", role.description));
    this.write(`type ${role.name} interface {\n`);
  }

  visitOperation(context: Context): void {
    const { operation } = context;
    this.write(formatComment("// ", operation.description));
    this.write(
      `${methodName(operation, operation.name)}(ctx ${
        this.contextPackage
      }Context`
    );
    if (operation.parameters.length > 0) {
      this.write(`, `);
    }
    const translate = translateAlias(context);
    this.write(
      `${mapParams(context, operation.parameters, undefined, translate)})`
    );
    if (!isVoid(operation.type)) {
      this.write(
        ` (${returnPointer(context, operation.type)}${expandType(
          operation.type,
          undefined,
          true,
          translate
        )}, error)`
      );
    } else {
      this.write(` error`);
    }
    this.write(`\n`);
  }

  visitRoleAfter(context: Context): void {
    this.write(`}\n\n`);
  }
}
