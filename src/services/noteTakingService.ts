import type {
  CreateNoteTakingInput,
  NoteTakingRecord,
  UpdateNoteTakingInput,
} from "../types/note-taking";

export class NoteTakingService {
  // Keep persistence in memory for the MVP so the starter stays database-agnostic.
  private readonly items = new Map<string, NoteTakingRecord>();

  list(): NoteTakingRecord[] {
    return Array.from(this.items.values());
  }

  getById(id: string): NoteTakingRecord | undefined {
    return this.items.get(id);
  }

  create(input: CreateNoteTakingInput): NoteTakingRecord {
    const record: NoteTakingRecord = {
      id: this.createId(),
      ...input,
    };

    this.items.set(record.id, record);
    return record;
  }

  update(
    id: string,
    input: UpdateNoteTakingInput,
  ): NoteTakingRecord | undefined {
    const existingRecord = this.items.get(id);

    if (!existingRecord) {
      return undefined;
    }

    const updatedRecord: NoteTakingRecord = {
      ...existingRecord,
      ...input,
      id,
    };

    this.items.set(id, updatedRecord);
    return updatedRecord;
  }

  delete(id: string): boolean {
    return this.items.delete(id);
  }

  private createId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
