import type {
  EditPlan,
  EditPlanFields,
  ValidatedEditPlan,
} from "../lib/pdf/edit/editPlan.ts";
import type {
  MultiRunEditPlan,
  ValidatedMultiRunEditPlan,
} from "../lib/pdf/edit/multiRunEditPlan.ts";
import type {
  NativeTextStyleBatchPlan,
  ValidatedNativeTextStyleBatchPlan,
} from "../lib/pdf/edit/multiStylePlan.ts";
import {
  applyEditPlanToDocument,
  applyMultiRunEditPlanToDocument,
  applyNativeTextStyleBatchToDocument,
} from "../lib/pdf/edit/applyEditPlan.ts";

type IsAssignable<From, To> = [From] extends [To] ? true : false;
type AssertFalse<Value extends false> = Value;
type AssertTrue<Value extends true> = Value;

type SingleWriterPlan = Parameters<typeof applyEditPlanToDocument>[1];
type MultiWriterPlan = Parameters<typeof applyMultiRunEditPlanToDocument>[1];
type BatchWriterPlan =
  Parameters<typeof applyNativeTextStyleBatchToDocument>[1];

type _SingleWriterIsValidated = AssertTrue<
  IsAssignable<SingleWriterPlan, ValidatedEditPlan>
>;
type _MultiWriterIsValidated = AssertTrue<
  IsAssignable<MultiWriterPlan, ValidatedMultiRunEditPlan>
>;
type _BatchWriterIsValidated = AssertTrue<
  IsAssignable<BatchWriterPlan, ValidatedNativeTextStyleBatchPlan>
>;

// A broad dry-run result must be narrowed/proven before it can cross a writer
// boundary. If any writer regresses to accepting the broad union, these types
// stop compiling.
type _BroadSingleCannotWrite = AssertFalse<
  IsAssignable<EditPlan, SingleWriterPlan>
>;
type _BroadMultiCannotWrite = AssertFalse<
  IsAssignable<MultiRunEditPlan, MultiWriterPlan>
>;
type _BroadBatchCannotWrite = AssertFalse<
  IsAssignable<NativeTextStyleBatchPlan, BatchWriterPlan>
>;

// More importantly, merely copying every public field and setting
// editable:true is still insufficient. ValidatedEditPlan carries a private
// symbol brand that only buildEditPlan() can issue.
type UnbrandedEditableLookingPlan = EditPlanFields & {
  editable: true;
  reason: null;
};
type _EditableFlagAloneCannotWrite = AssertFalse<
  IsAssignable<UnbrandedEditableLookingPlan, SingleWriterPlan>
>;

// Copying/spreading a genuine proof must also lose authority. This guards the
// subtle case where a caller starts from a valid plan, changes one public
// field, and otherwise keeps all visible data.
declare const genuineSingle: ValidatedEditPlan;
const spreadSingle = {
  ...genuineSingle,
  replacementText: "tampered after validation",
};
type _SpreadSingleCannotWrite = AssertFalse<
  IsAssignable<typeof spreadSingle, SingleWriterPlan>
>;

declare const genuineMulti: ValidatedMultiRunEditPlan;
const spreadMulti = {
  ...genuineMulti,
  replacementText: "tampered after validation",
};
type _SpreadMultiCannotWrite = AssertFalse<
  IsAssignable<typeof spreadMulti, MultiWriterPlan>
>;

declare const genuineBatch: ValidatedNativeTextStyleBatchPlan;
const spreadBatch = {
  ...genuineBatch,
  contentStreamIndex: genuineBatch.contentStreamIndex + 1,
};
type _SpreadBatchCannotWrite = AssertFalse<
  IsAssignable<typeof spreadBatch, BatchWriterPlan>
>;

export {};
