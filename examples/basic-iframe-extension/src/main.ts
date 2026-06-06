import { createFieldExtensionClient } from '@tachyon/field-extension-sdk'

const output = document.getElementById('output')
const field = createFieldExtensionClient()

field.frame.ready()
field.frame.resize()

if (output) {
  output.textContent = JSON.stringify(field.context, null, 2)
}
