	.globl	outstr
	.globl	main
	.module	stmt_outstr.i
	.area	_CODE
main:
	ld	hl,#.0+0
	push	hl
	ld	a,#1
	call	outstr
	pop	bc
	ret
	.area	_DATA
.0:	.ascii	"TS STMT$"
	.area	_BSS
