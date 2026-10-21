import { registerWebModule, NativeModule } from 'expo';

class CullaNativeModule extends NativeModule<{}> {}

export default registerWebModule(CullaNativeModule, 'CullaNativeModule');
