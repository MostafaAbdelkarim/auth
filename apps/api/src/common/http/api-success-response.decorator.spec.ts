import { ApiSuccessResponse } from './api-success-response.decorator';

class Thing {
  name: string;
}

function responsesOf(target: object, method: string): Record<string, { schema: unknown }> {
  const descriptor = Object.getOwnPropertyDescriptor(target, method)!;
  return Reflect.getMetadata('swagger/apiResponse', descriptor.value);
}

describe('ApiSuccessResponse', () => {
  it('documents the envelope with a model, defaulting to 200', () => {
    class Controller {
      @ApiSuccessResponse(Thing)
      get() {}
    }
    const responses = responsesOf(Controller.prototype, 'get');
    expect(responses['200'].schema).toMatchObject({
      properties: { data: { $ref: '#/components/schemas/Thing' } },
    });
  });

  it('documents a null payload with a custom status', () => {
    class Controller {
      @ApiSuccessResponse(null, { status: 201, description: 'created' })
      post() {}
    }
    const responses = responsesOf(Controller.prototype, 'post');
    expect(responses['201'].schema).toMatchObject({ properties: { data: { type: 'null' } } });
  });
});
