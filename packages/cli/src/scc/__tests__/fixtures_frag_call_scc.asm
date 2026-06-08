	.globl	outstr
	.globl	main
	.module	frag_call.i
	.area	_CODE
main:
	call	outstr
	ret
