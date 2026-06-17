	.globl	outchar
	.globl	main
	.module	stmt_call_result.i
	.area	_CODE
main:
	call	value
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	ret
value:
	ld	hl,#88
	ret
	.area	_BSS
