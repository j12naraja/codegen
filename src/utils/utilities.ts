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

import { FieldDefinition, Name, TypeDefinition } from "@apexlang/core/ast";
import {
  AnyType,
  Context,
  Kind,
  List,
  Map,
  Optional,
  Type,
  Annotated,
  Alias,
  Annotation,
  TypeResolver,
  Operation,
  Role,
  Stream,
} from "@apexlang/core/model";

export function isOneOfType(context: Context, types: string[]): boolean {
  if (context.role) {
    const role = context.role;
    let found = false;
    for (let i = 0; i < types.length; i++) {
      if (role.annotation(types[i]) != undefined) {
        found = true;
        break;
      }
    }
    if (!found) {
      return false;
    }
    return (
      role.operations.find((o) => {
        return o.annotation("nocode") == undefined;
      }) != undefined
    );
  }
  return false;
}

export function isHandler(context: Context): boolean {
  return isService(context) || isEvents(context);
}

export function isService(context: Context): boolean {
  if (context.interface) {
    return true;
  }
  if (context.role) {
    const { role } = context;
    if (role.annotation("service") == undefined) {
      return false;
    }
    return (
      role.operations.find((o) => {
        return o.annotation("nocode") == undefined;
      }) != undefined
    );
  }
  return false;
}

export function hasServiceCode(context: Context): boolean {
  for (let name in context.namespace.roles) {
    const role = context.namespace.roles[name];
    if (role.annotation("service") == undefined) {
      continue;
    }
    if (
      role.operations.find((o) => {
        return o.annotation("nocode") == undefined;
      }) != undefined
    ) {
      return true;
    }
  }
  return false;
}

export function hasMethods(role: Role): boolean {
  if (
    role.operations.find((o) => {
      return o.annotation("nocode") == undefined;
    }) != undefined
  ) {
    return true;
  }
  return false;
}

export function hasCode(context: Context): boolean {
  if (context.interface) {
    return true;
  }
  if (context.role) {
    const { role } = context;
    if (
      role.annotation("service") == undefined &&
      role.annotation("provider") == undefined &&
      role.annotation("dependency") == undefined
    ) {
      return false;
    }
    return (
      role.operations.find((o) => {
        return o.annotation("nocode") == undefined;
      }) != undefined
    );
  }
  return false;
}

export function isEvents(context: Context): boolean {
  if (context.role) {
    const { role } = context;
    if (role.annotation("events") == undefined) {
      return false;
    }
    return (
      role.operations.find((o) => {
        return o.annotation("nocode") == undefined;
      }) != undefined
    );
  }
  return false;
}

export function isProvider(context: Context): boolean {
  if (context.role) {
    const { role } = context;
    if (
      role.annotation("provider") == undefined &&
      role.annotation("dependency") == undefined &&
      role.annotation("activities") == undefined
    ) {
      return false;
    }
    return (
      role.operations.find((o) => {
        return o.annotation("nocode") == undefined;
      }) != undefined
    );
  }
  return false;
}

export function noCode(annotated: Annotated): boolean {
  if (annotated) {
    return annotated.annotation("nocode") != undefined;
  }
  return false;
}

/**
 * Determines if a node is a void node
 * @param t Node that is a Type node
 */
export function isVoid(t: AnyType): boolean {
  return t.kind === Kind.Void;
}

export function isNamed(t: AnyType): boolean {
  switch (t.kind) {
    case Kind.Alias:
    case Kind.Enum:
    case Kind.Type:
    case Kind.Union:
      return true;
  }
  return false;
}

/**
 * Determines if Type Node is a Named node and if its type is not one of the base translation types.
 * @param t Node that is a Type node
 */
export function isObject(t: AnyType, recurseOption: boolean = true): boolean {
  while (t.kind == Kind.Alias || t.kind == Kind.Optional) {
    if (t.kind == Kind.Optional) {
      if (recurseOption) {
        t = (t as Optional).type;
      } else {
        break;
      }
    } else if (t.kind == Kind.Alias) {
      t = (t as Alias).type;
    }
  }
  switch (t.kind) {
    case Kind.Type:
    case Kind.Union:
      return true;
  }
  return false;
}

export function isPrimitive(t: AnyType): boolean {
  return t.kind === Kind.Primitive;
}

export function visitNamed(t: AnyType, callback: (name: string) => void): void {
  if (!t) {
    return;
  }

  switch (t.kind) {
    case Kind.Type:
      const named = t as Type;
      callback(named.name);
      break;
    case Kind.Optional:
      visitNamed((t as Optional).type, callback);
      break;
    case Kind.List:
      visitNamed((t as List).type, callback);
      break;
    case Kind.Map:
      const m = t as Map;
      visitNamed(m.keyType, callback);
      visitNamed(m.valueType, callback);
      break;
  }
}

export const primitives = new Set([
  "bool",
  "i8",
  "i16",
  "i32",
  "i64",
  "u8",
  "u16",
  "u32",
  "u64",
  "f32",
  "f64",
  "string",
]);

export function formatComment(
  prefix: string,
  text: string | undefined,
  wrapLength: number = 80
): string {
  if (text == undefined) {
    return "";
  }
  let textValue = "";
  if (!text || typeof text === "string") {
    textValue = text;
  }

  // Replace single newline characters with space so that the logic below
  // handles line wrapping. Multiple newlines are preserved. It was simpler
  // to do this than regex.
  for (i = 1; i < textValue.length - 1; i++) {
    if (
      textValue[i] == "\n" &&
      textValue[i - 1] != "\n" &&
      textValue[i + 1] != "\n"
    ) {
      textValue = textValue.substring(0, i) + " " + textValue.substring(i + 1);
    }
  }

  let comment = "";
  let line = "";
  let word = "";
  for (var i = 0; i < textValue.length; i++) {
    let c = textValue[i];
    if (c == " " || c == "\n") {
      if (line.length + word.length > wrapLength) {
        if (comment.length > 0) {
          comment += "\n";
        }
        comment += prefix + line.trim();
        line = word.trim();
        word = " ";
      } else if (c == "\n") {
        line += word;
        if (comment.length > 0) {
          comment += "\n";
        }
        comment += prefix + line.trim();
        line = "";
        word = "";
      } else {
        line += word;
        word = c;
      }
    } else {
      word += c;
    }
  }
  if (line.length + word.length > wrapLength) {
    if (comment.length > 0) {
      comment += "\n";
    }
    comment += prefix + line.trim();
    line = word.trim();
  } else {
    line += word;
  }
  if (line.length > 0) {
    if (comment.length > 0) {
      comment += "\n";
    }
    comment += prefix + line.trim();
  }
  if (comment.length > 0) {
    comment += "\n";
  }
  return comment;
}

// The following functions are from
// https://github.com/blakeembrey/change-case
// Pasted here to avoid an NPM dependency for the CLI.

export function camelCaseTransform(input: string, index: number) {
  if (index === 0) return input.toLowerCase();
  return pascalCaseTransform(input, index);
}

export function camelCaseTransformMerge(input: string, index: number) {
  if (index === 0) return input.toLowerCase();
  return pascalCaseTransformMerge(input);
}

export function camelCase(input: string, options: Options = {}) {
  return pascalCase(input, {
    transform: camelCaseTransform,
    ...options,
  });
}

export function pascalCaseTransform(input: string, index: number) {
  const firstChar = input.charAt(0);
  const lowerChars = input.substr(1).toLowerCase();
  if (index > 0 && firstChar >= "0" && firstChar <= "9") {
    return `_${firstChar}${lowerChars}`;
  }
  return `${firstChar.toUpperCase()}${lowerChars}`;
}

export function pascalCaseTransformMerge(input: string) {
  return input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
}

export function pascalCase(input: string, options: Options = {}) {
  return noCase(input, {
    delimiter: "",
    transform: pascalCaseTransform,
    ...options,
  });
}

export function snakeCase(input: string, options: Options = {}) {
  return dotCase(input, {
    delimiter: "_",
    ...options,
  });
}

export function dotCase(input: string, options: Options = {}) {
  return noCase(input, {
    delimiter: ".",
    ...options,
  });
}

// Support camel case ("camelCase" -> "camel Case" and "CAMELCase" -> "CAMEL Case").
const DEFAULT_SPLIT_REGEXP = [/([a-z0-9])([A-Z])/g, /([A-Z])([A-Z][a-z])/g];

// Remove all non-word characters.
const DEFAULT_STRIP_REGEXP = /[^A-Z0-9]+/gi;

export interface Options {
  splitRegexp?: RegExp | RegExp[];
  stripRegexp?: RegExp | RegExp[];
  delimiter?: string;
  transform?: (part: string, index: number, parts: string[]) => string;
}

export function noCase(input: string, options: Options = {}) {
  const {
    splitRegexp = DEFAULT_SPLIT_REGEXP,
    stripRegexp = DEFAULT_STRIP_REGEXP,
    transform = lowerCase,
    delimiter = " ",
  } = options;

  let result = replace(
    replace(input, splitRegexp, "$1\0$2"),
    stripRegexp,
    "\0"
  );
  let start = 0;
  let end = result.length;

  // Trim the delimiter from around the output string.
  while (result.charAt(start) === "\0") start++;
  while (result.charAt(end - 1) === "\0") end--;

  // Transform each token independently.
  return result.slice(start, end).split("\0").map(transform).join(delimiter);
}

/**
 * Replace `re` in the input string with the replacement value.
 */
function replace(input: string, re: RegExp | RegExp[], value: string) {
  if (re instanceof RegExp) return input.replace(re, value);
  return re.reduce((input, re) => input.replace(re, value), input);
}

/**
 * Locale character mapping rules.
 */
interface Locale {
  regexp: RegExp;
  map: Record<string, string>;
}

/**
 * Source: ftp://ftp.unicode.org/Public/UCD/latest/ucd/SpecialCasing.txt
 */
const SUPPORTED_LOCALE: Record<string, Locale> = {
  tr: {
    regexp: /\u0130|\u0049|\u0049\u0307/g,
    map: {
      İ: "\u0069",
      I: "\u0131",
      İ: "\u0069",
    },
  },
  az: {
    regexp: /\u0130/g,
    map: {
      İ: "\u0069",
      I: "\u0131",
      İ: "\u0069",
    },
  },
  lt: {
    regexp: /\u0049|\u004A|\u012E|\u00CC|\u00CD|\u0128/g,
    map: {
      I: "\u0069\u0307",
      J: "\u006A\u0307",
      Į: "\u012F\u0307",
      Ì: "\u0069\u0307\u0300",
      Í: "\u0069\u0307\u0301",
      Ĩ: "\u0069\u0307\u0303",
    },
  },
};

/**
 * Localized lower case.
 */
export function localeLowerCase(str: string, locale: string) {
  const lang = SUPPORTED_LOCALE[locale.toLowerCase()];
  if (lang) return lowerCase(str.replace(lang.regexp, (m) => lang.map[m]));
  return lowerCase(str);
}

/**
 * Lower case as a function.
 */
export function lowerCase(str: string) {
  return str.toLowerCase();
}

/**
 * Capitlizes a given string
 * @param str string to be capitlized
 * @returns string with first character capitalized. If empty string returns empty string.
 */
export function capitalize(str: string): string {
  if (str.length == 0) return str;
  if (str.length == 1) return str[0].toUpperCase();
  return str[0].toUpperCase() + str.slice(1);
}

export function uncapitalize(str: string): string {
  if (str.length == 0) return str;
  if (str.length == 1) return str[0].toLowerCase();
  return str[0].toLowerCase() + str.slice(1);
}

export function capitalizeRename(annotated: Annotated, str: string): string {
  const rename = renamed(annotated);
  if (rename != undefined) {
    return rename;
  }
  return capitalize(str);
}

interface RenameDirective {
  value: { [key: string]: string };
}

export function renamed(
  annotated: Annotated,
  defaultVal?: string
): string | undefined {
  let ret: string | undefined = defaultVal;
  annotated.annotation("rename", (a: Annotation) => {
    const rename = a.convert<RenameDirective>();
    ret = rename.value.go;
  });
  return ret;
}

/**
 * Determines if one of the annotations provided is a reference
 * @param annotations array of Directives
 */
export function isReference(annotations: Annotation[]): boolean {
  for (let annotation of annotations) {
    if (annotation.name == "ref" || annotation.name == "reference") {
      return true;
    }
  }
  return false;
}

export function operationTypeName(operation: Operation): string {
  return capitalize(renamed(operation, operation.name)!);
}

export function convertOperationToType(
  tr: TypeResolver,
  operation: Operation,
  prefix?: string
): Type {
  var fields = operation.parameters.map((param) => {
    return new FieldDefinition(
      param.node.loc,
      param.node.name,
      param.node.description,
      param.node.type,
      param.node.default,
      param.node.annotations
    );
  });
  return new Type(
    tr,
    new TypeDefinition(
      operation.node.loc,
      new Name(
        operation.node.name.loc,
        (prefix != undefined ? prefix : "") +
          operationTypeName(operation) +
          "Args"
      ),
      undefined,
      [],
      operation.node.annotations,
      fields
    )
  );
}

export function convertArrayToObject<T, D>(
  array: T[],
  keyFunc: (value: T) => string,
  convert: (value: T) => D = (value: T) => value as unknown as D
): { [key: string]: D } {
  const obj: { [key: string]: D } = {};
  array.forEach((value) => {
    const keyVal = keyFunc(value);
    obj[keyVal] = convert(value);
  });
  return obj;
}

export function unwrapKinds(t: AnyType, ...kinds: Kind[]): AnyType {
  while (true) {
    if (isKinds(t, ...kinds)) {
      switch (t.kind) {
        case Kind.Alias:
          t = (t as Alias).type;
          break;
        case Kind.Optional:
          t = (t as Optional).type;
          break;
        case Kind.List:
          t = (t as List).type;
          break;
        case Kind.Map:
          t = (t as Map).valueType;
          break;
        case Kind.Stream:
          t = (t as Stream).type;
          break;
        default:
          return t;
      }
    } else {
      return t;
    }
  }
}

export function isKinds(t: AnyType, ...kinds: Kind[]): boolean {
  return kinds.indexOf(t.kind) != -1;
}
