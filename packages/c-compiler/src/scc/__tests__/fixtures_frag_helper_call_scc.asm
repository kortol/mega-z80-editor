	.globl	.gint
	.globl	main
	.module	frag_helper_call.i
	.area	_CODE
main:
	call	.gint
	ret
	.area	_BSS
