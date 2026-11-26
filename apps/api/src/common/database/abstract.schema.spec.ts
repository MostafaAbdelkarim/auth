import { Prop, Schema } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {
  AbstractSchema,
  BASE_SCHEMA_OPTIONS,
  createSchema,
  type SoftDeleteModel,
} from './abstract.schema';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

@Schema({ collection: 'widgets', ...BASE_SCHEMA_OPTIONS })
class Widget extends AbstractSchema {
  @Prop({ required: true })
  name: string;
}

describe('AbstractSchema', () => {
  let mongo: MongoMemoryServer;
  let connection: mongoose.Connection;
  let Widgets: SoftDeleteModel<Widget>;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    connection = await mongoose.createConnection(mongo.getUri('abstract-spec')).asPromise();
    Widgets = connection.model<Widget, SoftDeleteModel<Widget>>(Widget.name, createSchema(Widget));
    await Widgets.init();
  });

  afterEach(() => Widgets.deleteMany({}, { withDeleted: true }));

  afterAll(async () => {
    await connection.close();
    await mongo.stop();
  });

  it('gives every document a UUIDv4 id and timestamps', async () => {
    const widget = await Widgets.create({ name: 'a' });
    expect(widget._id).toMatch(UUID_V4);
    expect(widget.id).toBe(widget._id);
    expect(widget.createdAt).toBeInstanceOf(Date);
    expect(widget.updatedAt).toBeInstanceOf(Date);
    expect(widget.deletedAt).toBeNull();
  });

  it('generates a different id per document', async () => {
    const [a, b] = await Widgets.create([{ name: 'a' }, { name: 'b' }]);
    expect(a._id).not.toBe(b._id);
  });

  it('hides soft-deleted documents from reads, counts and updates', async () => {
    const kept = await Widgets.create({ name: 'kept' });
    const gone = await Widgets.create({ name: 'gone' });
    await Widgets.softDeleteById(gone._id);

    expect((await Widgets.find()).map((w) => w.name)).toEqual(['kept']);
    expect(await Widgets.findById(gone._id)).toBeNull();
    expect(await Widgets.findOne({ name: 'gone' })).toBeNull();
    expect(await Widgets.countDocuments()).toBe(1);
    expect(await Widgets.findOneAndUpdate({ name: 'gone' }, { name: 'x' })).toBeNull();
    expect((await Widgets.updateMany({}, { name: 'renamed' })).modifiedCount).toBe(1);
    expect(await Widgets.aggregate([{ $match: {} }])).toHaveLength(1);
    expect((await Widgets.findById(kept._id))?.name).toBe('renamed');
  });

  it('records when a document was soft-deleted and can still read it on request', async () => {
    const widget = await Widgets.create({ name: 'a' });
    expect(await Widgets.softDeleteById(widget._id)).toBe(true);

    const raw = await Widgets.findById(widget._id).setOptions({ withDeleted: true });
    expect(raw?.deletedAt).toBeInstanceOf(Date);
    expect(await Widgets.countDocuments({}, { withDeleted: true })).toBe(1);
    expect(await Widgets.aggregate([{ $match: {} }]).option({ withDeleted: true })).toHaveLength(1);
  });

  it('reports false when there is nothing to soft-delete', async () => {
    expect(await Widgets.softDeleteById('7b0ad5ab-0f43-4a39-9d26-5b8b0d3d4c7e')).toBe(false);
  });

  it('respects an explicit deletedAt filter', async () => {
    const widget = await Widgets.create({ name: 'a' });
    await Widgets.softDeleteById(widget._id);
    expect(await Widgets.find({ deletedAt: { $ne: null } })).toHaveLength(1);
  });
});
